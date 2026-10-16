import { describe, expect, it, vi } from "vitest";
import { parseInputs } from "../src/inputs.ts";
import {
  COMMENT_LIMIT,
  commentBody,
  MARKER,
  signalsOf,
} from "../src/report.ts";
import { type GitHubPort, type PullRequest, run } from "../src/run.ts";
import type { DependencyChange } from "../src/sources/dependency-graph.ts";
import type { ApiAnswer } from "../src/types.ts";
import {
  answer,
  answered,
  change,
  DEPENDABOT_GRADLE,
  DEPENDABOT_GROUP,
  renovateMarker,
} from "./fixtures.ts";

const DEFAULTS: Record<string, string> = {
  "github-token": "t",
  comment: "auto",
  "fail-on": "none",
  "record-misses": "auto",
  exclude: "",
  "api-url": "https://whatsnew.fyi",
};

function inputs(over: Record<string, string> = {}) {
  return parseInputs((name) => ({ ...DEFAULTS, ...over })[name] ?? "");
}

const DEPENDABOT_PR: PullRequest = {
  number: 7,
  author: "dependabot[bot]",
  headRef: "dependabot/npm_and_yarn/npm_and_yarn-1a2b3c",
  baseSha: "base",
  headSha: "head",
  body: "Bumps the npm_and_yarn group with 2 updates…",
};

const HUMAN_PR: PullRequest = {
  ...DEPENDABOT_PR,
  author: "octocat",
  headRef: "bump-next",
  body: "Bumping next.",
};

function github(
  over: Partial<GitHubPort> & {
    messages?: string[];
    changes?: DependencyChange[];
    existing?: { id: number; body: string };
  } = {},
) {
  const port = {
    commitMessages: vi.fn(async () => over.messages ?? [DEPENDABOT_GROUP]),
    dependencyChanges: vi.fn(async (_basehead: string) => over.changes),
    findComment: vi.fn(async (_marker: string) => over.existing),
    createComment: vi.fn(async (_body: string) => {}),
    updateComment: vi.fn(async (_id: number, _body: string) => {}),
    ...over,
  };
  return port;
}

function ports(gh: GitHubPort, reply: (body: unknown) => ApiAnswer) {
  const fetch = vi.fn(
    async (_url: string | URL | Request, init?: RequestInit) =>
      Response.json(reply(JSON.parse(String(init?.body)))),
  );
  return {
    github: gh,
    fetch,
    sleep: async () => {},
    writeJson: vi.fn(async () => "/tmp/whatsnew-upgrade-notes.json"),
    info: vi.fn(),
    warning: vi.fn(),
  };
}

const BREAKING = answer(
  [
    answered("next", {
      from: "15.5.0",
      to: "16.0.0",
      signals: {
        majorBump: true,
        breakingMentions: 0,
        removed: 0,
        deprecated: 0,
        security: 1,
        cves: ["CVE-2026-2", "CVE-2026-1"],
      },
    }),
    answered("better-auth"),
  ],
  "### Upgrade notes from What's New\n\n| next | breaking |",
);

describe("run", () => {
  it("reads a Dependabot group, asks once, comments, and sets the outputs", async () => {
    const gh = github();
    const p = ports(gh, () => BREAKING);
    const result = await run(inputs(), DEPENDABOT_PR, { private: false }, p);

    expect(result.source).toBe("dependabot");
    expect(JSON.parse(String(p.fetch.mock.calls[0]?.[1]?.body))).toEqual({
      dependencies: [
        { name: "next", from: "15.5.0", to: "16.0.0" },
        { name: "better-auth", from: "1.6.21", to: "1.7.1" },
      ],
      recordMisses: true,
    });
    expect(gh.dependencyChanges).not.toHaveBeenCalled();
    expect(gh.createComment).toHaveBeenCalledWith(
      `${MARKER}\n### Upgrade notes from What's New\n\n| next | breaking |`,
    );
    expect(result.comment).toBe("created");
    expect(result.outputs).toEqual({
      breaking: "true",
      security: "true",
      cves: "CVE-2026-1,CVE-2026-2",
      dependencies: "2",
      answered: "2",
      json: "/tmp/whatsnew-upgrade-notes.json",
    });
    expect(result.failure).toBeUndefined();
  });

  it("edits its own comment on the next push instead of adding another", async () => {
    const gh = github({ existing: { id: 99, body: `${MARKER}\nold notes` } });
    const result = await run(
      inputs(),
      DEPENDABOT_PR,
      { private: false },
      ports(gh, () => BREAKING),
    );
    expect(gh.updateComment).toHaveBeenCalledWith(
      99,
      expect.stringContaining("| next | breaking |"),
    );
    expect(gh.createComment).not.toHaveBeenCalled();
    expect(result.comment).toBe("updated");
  });

  it("leaves an identical comment alone", async () => {
    const body = commentBody([BREAKING]).body;
    const gh = github({ existing: { id: 99, body } });
    const result = await run(
      inputs(),
      DEPENDABOT_PR,
      { private: false },
      ports(gh, () => BREAKING),
    );
    expect(result.comment).toBe("unchanged");
    expect(gh.updateComment).not.toHaveBeenCalled();
  });

  it("keeps a private repository's misses at home unless told otherwise", async () => {
    const gh = github();
    const p = ports(gh, () => BREAKING);
    await run(inputs(), DEPENDABOT_PR, { private: true }, p);
    expect(
      JSON.parse(String(p.fetch.mock.calls[0]?.[1]?.body)).recordMisses,
    ).toBe(false);
  });

  it("never sends an excluded package", async () => {
    const gh = github();
    const p = ports(gh, () => BREAKING);
    const result = await run(
      inputs({ exclude: "better-*" }),
      DEPENDABOT_PR,
      { private: false },
      p,
    );
    const sent = JSON.parse(String(p.fetch.mock.calls[0]?.[1]?.body));
    expect(sent.dependencies.map((d: { name: string }) => d.name)).toEqual([
      "next",
    ]);
    expect(result.skipped).toEqual(["better-auth (excluded)"]);
    // ADR 2026-10.d86j: a skip is said in the log and the comment, not only
    // in the comment that answers nothing.
    expect(p.info).toHaveBeenCalledWith("Skipped better-auth (excluded).");
    expect(gh.createComment).toHaveBeenCalledWith(
      expect.stringMatching(/\n\nSkipped: better-auth \(excluded\)\.$/),
    );
  });

  it("sends a Gradle group's wrapper and plugins, once each, and names what it cannot", async () => {
    const gh = github({ messages: [DEPENDABOT_GRADLE] });
    const p = ports(gh, () => BREAKING);
    const result = await run(
      inputs(),
      { ...DEPENDABOT_PR, headRef: "dependabot/gradle/gradle-e7d4689dfc" },
      { private: false },
      p,
    );
    expect(JSON.parse(String(p.fetch.mock.calls[0]?.[1]?.body))).toEqual({
      dependencies: [
        {
          name: "gradle-wrapper",
          from: "9.5.0",
          to: "9.8.1",
          purl: "pkg:github/gradle/gradle",
        },
        {
          name: "org.xerial:sqlite-jdbc",
          from: "3.50.3.0",
          to: "3.53.4.0",
          purl: "pkg:maven/org.xerial/sqlite-jdbc",
        },
        {
          name: "org.jetbrains.kotlin.plugin.serialization",
          from: "2.4.0",
          to: "2.4.21",
          purl: "pkg:maven/org.jetbrains.kotlin.plugin.serialization/org.jetbrains.kotlin.plugin.serialization.gradle.plugin",
        },
      ],
      recordMisses: true,
    });
    expect(result.skipped).toEqual([
      'toolchain ("toolchain" is not a maven name)',
    ]);
    expect(gh.createComment).toHaveBeenCalledWith(
      expect.stringContaining(
        'Skipped: toolchain ("toolchain" is not a maven name).',
      ),
    );
  });

  it("reads a Renovate PR from the preset's markers", async () => {
    const pr: PullRequest = {
      ...HUMAN_PR,
      author: "renovate[bot]",
      headRef: "renovate/next-16.x",
      body: renovateMarker({
        depName: "next",
        currentVersion: "15.5.0",
        newVersion: "16.0.0",
        datasource: "npm",
      }),
    };
    const gh = github();
    const result = await run(
      inputs(),
      pr,
      { private: false },
      ports(gh, () => BREAKING),
    );
    expect(result.source).toBe("renovate");
    expect(gh.commitMessages).not.toHaveBeenCalled();
    expect(gh.dependencyChanges).not.toHaveBeenCalled();
  });

  it("reads any other PR from the dependency graph", async () => {
    const gh = github({
      changes: [
        change("removed", "next", "15.5.0"),
        change("added", "next", "16.0.0"),
      ],
    });
    const p = ports(gh, () => BREAKING);
    const result = await run(inputs(), HUMAN_PR, { private: false }, p);
    expect(gh.dependencyChanges).toHaveBeenCalledWith("base...head");
    expect(result.source).toBe("dependency-graph");
    expect(
      JSON.parse(String(p.fetch.mock.calls[0]?.[1]?.body)).dependencies,
    ).toEqual([
      { name: "next", from: "15.5.0", to: "16.0.0", purl: "pkg:npm/next" },
    ]);
  });

  it("says nothing and calls nothing when a PR moves no dependency", async () => {
    const gh = github({ changes: [] });
    const p = ports(gh, () => BREAKING);
    const result = await run(inputs(), HUMAN_PR, { private: false }, p);
    expect(p.fetch).not.toHaveBeenCalled();
    expect(gh.createComment).not.toHaveBeenCalled();
    expect(result.comment).toBe("skipped");
    expect(result.outputs.dependencies).toBe("0");
  });

  it("replaces its old notes when a later push moves no dependency", async () => {
    const gh = github({
      changes: [],
      existing: { id: 5, body: `${MARKER}\nstale` },
    });
    const result = await run(
      inputs(),
      HUMAN_PR,
      { private: false },
      ports(gh, () => BREAKING),
    );
    expect(gh.updateComment).toHaveBeenCalledWith(
      5,
      expect.stringContaining("No dependency version changes found"),
    );
    expect(result.comment).toBe("updated");
  });

  it("says where the graph is unavailable, and still exits clean", async () => {
    const gh = github({ changes: undefined });
    const p = ports(gh, () => BREAKING);
    const result = await run(inputs(), HUMAN_PR, { private: true }, p);
    expect(p.info).toHaveBeenCalledWith(
      expect.stringContaining("dependency graph is not available"),
    );
    expect(result.failure).toBeUndefined();
  });

  it("warns and passes when What's New does not answer", async () => {
    const gh = github();
    const p = {
      ...ports(gh, () => BREAKING),
      fetch: vi.fn(async () => new Response("", { status: 502 })),
    };
    const result = await run(
      inputs({ "fail-on": "breaking" }),
      DEPENDABOT_PR,
      { private: false },
      p,
    );
    expect(p.warning).toHaveBeenCalledWith(
      "What's New answered 502. No upgrade notes this run.",
    );
    expect(result.failure).toBeUndefined();
    expect(gh.createComment).not.toHaveBeenCalled();
  });

  it("warns, and keeps the summary, when the token cannot comment", async () => {
    const gh = github({
      createComment: vi.fn(async () => {
        throw Object.assign(new Error("Resource not accessible"), {
          status: 403,
        });
      }),
    });
    const p = ports(gh, () => BREAKING);
    const result = await run(inputs(), DEPENDABOT_PR, { private: false }, p);
    expect(result.comment).toBe("denied");
    expect(result.summary).toContain("| next | breaking |");
    expect(p.warning).toHaveBeenCalledWith(
      expect.stringContaining("pull-requests: write"),
    );
  });

  it("fails the step only for what fail-on names, after commenting", async () => {
    const gh = github();
    const result = await run(
      inputs({ "fail-on": "breaking,security" }),
      DEPENDABOT_PR,
      { private: false },
      ports(gh, () => BREAKING),
    );
    expect(gh.createComment).toHaveBeenCalled();
    expect(result.failure).toBe(
      "fail-on: the vendors' notes for this update include a breaking change, removal or major version and a security fix (CVE-2026-1, CVE-2026-2).",
    );

    const quiet = answer([answered("next"), answered("better-auth")]);
    const clean = await run(
      inputs({ "fail-on": "breaking,security" }),
      DEPENDABOT_PR,
      { private: false },
      ports(github(), () => quiet),
    );
    expect(clean.failure).toBeUndefined();
  });

  it("never comments when told not to", async () => {
    const gh = github();
    const result = await run(
      inputs({ comment: "never" }),
      DEPENDABOT_PR,
      { private: false },
      ports(gh, () => BREAKING),
    );
    expect(gh.findComment).not.toHaveBeenCalled();
    expect(result.comment).toBe("skipped");
    expect(result.summary).toBeDefined();
  });
});

describe("report", () => {
  it("counts a vendor 'breaking' heading as breaking even without the wording flag", () => {
    const withSection = answer([
      answered("x", { releases: [{ sections: [{ key: "breaking" }] }] }),
    ]);
    expect(signalsOf([withSection]).breaking).toBe(true);
    expect(signalsOf([answer([answered("x")])]).breaking).toBe(false);
  });

  it("ignores packages the API could not answer", () => {
    const signals = signalsOf([
      answer([
        answered("x", {
          status: "untracked",
          signals: {
            majorBump: true,
            breakingMentions: 1,
            removed: 0,
            deprecated: 0,
            security: 0,
            cves: [],
          },
        }),
      ]),
    ]);
    expect(signals).toEqual({
      breaking: false,
      security: false,
      cves: [],
      answered: 0,
    });
  });

  it("joins batches, and leaves to the summary what would overflow one comment", () => {
    const big = "x".repeat(40_000);
    const { body, omitted } = commentBody([
      answer([answered("a")], big),
      answer([answered("b"), answered("c")], big),
    ]);
    expect(body.length).toBeLessThanOrEqual(COMMENT_LIMIT);
    expect(omitted).toBe(2);
    expect(body).toContain("2 more packages are in this run's job summary");

    const small = commentBody([
      answer([answered("a")], "one"),
      answer([answered("b")], "two"),
    ]);
    expect(small.body).toBe(`${MARKER}\none\n\n---\n\ntwo`);
  });
});
