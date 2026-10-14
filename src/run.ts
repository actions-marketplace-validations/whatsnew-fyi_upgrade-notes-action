// The Action, minus the runner: which packages this PR moves, what What's New
// says about them, and what to post. Everything it touches outside itself comes
// in through `RunPorts`, so the tests drive it with plain objects and
// `main.ts` is only wiring.

import { ApiError, upgradeNotes } from "./api.ts";
import { excluded, toApiDependency } from "./ecosystems.ts";
import type { Inputs } from "./inputs.ts";
import {
  commentBody,
  emptyBody,
  MARKER,
  type Signals,
  signalsOf,
  summaryBody,
} from "./report.ts";
import { parseDependabotMessage } from "./sources/dependabot.ts";
import {
  type DependencyChange,
  pairChanges,
} from "./sources/dependency-graph.ts";
import { parseRenovateBody } from "./sources/renovate.ts";
import type { ApiAnswer, ApiDependency, Bump, SourceName } from "./types.ts";

export interface PullRequest {
  number: number;
  author: string;
  headRef: string;
  baseSha: string;
  headSha: string;
  body: string | null;
}

export interface GitHubPort {
  /** Commit messages on the PR, oldest first. */
  commitMessages(): Promise<string[]>;
  /** The dependency graph's diff, or undefined where GitHub will not give one. */
  dependencyChanges(basehead: string): Promise<DependencyChange[] | undefined>;
  findComment(
    marker: string,
  ): Promise<{ id: number; body: string } | undefined>;
  createComment(body: string): Promise<void>;
  updateComment(id: number, body: string): Promise<void>;
}

export interface RunPorts {
  github: GitHubPort;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Writes the full answer where the `json` output points; returns the path. */
  writeJson(answers: readonly ApiAnswer[]): Promise<string>;
  info(message: string): void;
  warning(message: string): void;
}

export type CommentOutcome =
  | "created"
  | "updated"
  | "unchanged"
  | "skipped"
  | "denied";

export interface RunResult {
  source?: SourceName;
  sent: number;
  skipped: string[];
  signals?: Signals;
  outputs: Record<string, string>;
  summary?: string;
  comment: CommentOutcome;
  /** Set when `fail-on` matched; the step fails with this message. */
  failure?: string;
}

const DEPENDABOT = "dependabot[bot]";

/** The first source that names any bump wins; each is tried only if needed. */
async function bumpsFor(
  pr: PullRequest,
  github: GitHubPort,
  info: (message: string) => void,
): Promise<{ source?: SourceName; bumps: Bump[] }> {
  if (pr.author === DEPENDABOT || pr.headRef.startsWith("dependabot")) {
    const [first] = await github.commitMessages();
    const bumps = first ? parseDependabotMessage(first, pr.headRef) : [];
    if (bumps.length) return { source: "dependabot", bumps };
    info("Dependabot's commit message named no version changes.");
  }

  const renovate = parseRenovateBody(pr.body);
  if (renovate.length) return { source: "renovate", bumps: renovate };

  const changes = await github.dependencyChanges(
    `${pr.baseSha}...${pr.headSha}`,
  );
  if (changes === undefined) {
    info(
      "GitHub's dependency graph is not available here (it needs a public repository or GitHub Advanced Security). Renovate users can add the preset instead; see the README.",
    );
    return { bumps: [] };
  }
  const bumps = pairChanges(changes);
  return bumps.length ? { source: "dependency-graph", bumps } : { bumps: [] };
}

function plan(
  bumps: readonly Bump[],
  exclude: readonly string[],
): { dependencies: ApiDependency[]; skipped: string[] } {
  const dependencies: ApiDependency[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  for (const bump of bumps) {
    if (excluded(bump.name, exclude)) {
      skipped.push(`${bump.name} (excluded)`);
      continue;
    }
    const mapped = toApiDependency(bump);
    if ("skip" in mapped) {
      skipped.push(`${bump.name} (${mapped.skip})`);
      continue;
    }
    // Two manifests bumping one package the same way is one question.
    const key = JSON.stringify(mapped.dependency);
    if (seen.has(key)) continue;
    seen.add(key);
    dependencies.push(mapped.dependency);
  }
  return { dependencies, skipped };
}

async function upsert(
  github: GitHubPort,
  body: string,
  warning: (message: string) => void,
): Promise<CommentOutcome> {
  try {
    const existing = await github.findComment(MARKER);
    if (existing?.body === body) return "unchanged";
    if (existing) {
      await github.updateComment(existing.id, body);
      return "updated";
    }
    await github.createComment(body);
    return "created";
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 403 || status === 404) {
      warning(
        "Could not comment on the pull request: give the workflow `permissions: pull-requests: write`. The notes are in this run's job summary.",
      );
      return "denied";
    }
    throw error;
  }
}

export async function run(
  inputs: Inputs,
  pr: PullRequest,
  repository: { private: boolean },
  ports: RunPorts,
): Promise<RunResult> {
  const { github } = ports;
  const { source, bumps } = await bumpsFor(pr, github, ports.info);
  const { dependencies, skipped } = plan(bumps, inputs.exclude);
  if (source) {
    ports.info(
      `Read ${bumps.length} version ${bumps.length === 1 ? "change" : "changes"} from ${source}; asking about ${dependencies.length}.`,
    );
  }

  const base = {
    source,
    sent: dependencies.length,
    skipped,
  };
  const zero = {
    breaking: "false",
    security: "false",
    cves: "",
    dependencies: String(dependencies.length),
    answered: "0",
    json: "",
  };

  if (dependencies.length === 0) {
    let comment: CommentOutcome = "skipped";
    if (inputs.comment === "always") {
      comment = await upsert(github, emptyBody(skipped), ports.warning);
    } else if (inputs.comment === "auto") {
      // An earlier push may have left notes for versions this PR no longer
      // moves; replace them rather than leave them standing.
      const existing = await github.findComment(MARKER).catch(() => undefined);
      if (existing)
        comment = await upsert(github, emptyBody(skipped), ports.warning);
    }
    return { ...base, outputs: zero, comment };
  }

  const recordMisses =
    inputs.recordMisses === "auto"
      ? !repository.private
      : inputs.recordMisses === "true";
  let answers: ApiAnswer[];
  try {
    answers = await upgradeNotes(dependencies, {
      apiUrl: inputs.apiUrl,
      recordMisses,
      fetch: ports.fetch,
      sleep: ports.sleep,
    });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    // The notes are a reviewer's aid; their absence never blocks a merge.
    ports.warning(`${error.message}. No upgrade notes this run.`);
    return { ...base, outputs: zero, comment: "skipped" };
  }

  const signals = signalsOf(answers);
  const json = await ports.writeJson(answers);
  const outputs = {
    breaking: String(signals.breaking),
    security: String(signals.security),
    cves: signals.cves.join(","),
    dependencies: String(dependencies.length),
    answered: String(signals.answered),
    json,
  };

  const comment =
    inputs.comment === "never"
      ? "skipped"
      : await upsert(github, commentBody(answers).body, ports.warning);

  const reasons = [
    inputs.failOn.has("breaking") && signals.breaking
      ? "a breaking change, removal or major version"
      : undefined,
    inputs.failOn.has("security") && signals.security
      ? `a security fix${signals.cves.length ? ` (${signals.cves.join(", ")})` : ""}`
      : undefined,
  ].filter((reason): reason is string => reason !== undefined);

  return {
    ...base,
    signals,
    outputs,
    summary: summaryBody(answers),
    comment,
    failure: reasons.length
      ? `fail-on: the vendors' notes for this update include ${reasons.join(" and ")}.`
      : undefined,
  };
}
