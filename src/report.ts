// From the API's answers to what the Action says: the outputs a workflow can
// gate on, the comment body, and the job summary.

import type { AnsweredDependency, ApiAnswer } from "./types.ts";

/** Finds this Action's comment again on the next push, so it is edited, not repeated. */
export const MARKER = "<!-- whatsnew-fyi/upgrade-notes-action -->";

/** GitHub refuses a comment over 65,536 characters. */
export const COMMENT_LIMIT = 65_000;

export interface Signals {
  /** A major version, the vendor's "breaking" wording or heading, or a removal. */
  breaking: boolean;
  /** A security item or a CVE id in any range. */
  security: boolean;
  cves: string[];
  /** Packages the API answered with a range. */
  answered: number;
}

function breakingIn(dep: AnsweredDependency): boolean {
  const signals = dep.signals;
  if (!signals) return false;
  return (
    signals.majorBump ||
    signals.breakingMentions > 0 ||
    signals.removed > 0 ||
    (dep.releases ?? []).some((release) =>
      (release.sections ?? []).some((section) => section.key === "breaking"),
    )
  );
}

export function signalsOf(answers: readonly ApiAnswer[]): Signals {
  const deps = answers.flatMap((answer) => answer.data.dependencies);
  const answered = deps.filter((dep) => dep.status === "ok");
  const cves = [
    ...new Set(answered.flatMap((dep) => dep.signals?.cves ?? [])),
  ].sort();
  return {
    breaking: answered.some(breakingIn),
    security:
      cves.length > 0 ||
      answered.some((dep) => (dep.signals?.security ?? 0) > 0),
    cves,
    answered: answered.length,
  };
}

/** How many skips the comment names before it points at the job summary. */
const SKIPS_IN_COMMENT = 20;

/** `Skipped: a (why); b (why).`, or nothing when nothing was skipped. */
function skippedLine(skipped: readonly string[], cap = Infinity): string {
  if (!skipped.length) return "";
  const shown = skipped.slice(0, cap);
  const more = skipped.length - shown.length;
  return `Skipped: ${shown.join("; ")}${more > 0 ? `; and ${more} more, in this run's job summary` : ""}.`;
}

/**
 * The comment: the marker, then each batch's rendering. One batch is the
 * common case; past the 20-package cap the batches are joined, and any that
 * would push the comment past GitHub's limit are left to the job summary.
 * Packages that were never sent close it, so nothing a PR moves goes unmentioned.
 */
export function commentBody(
  answers: readonly ApiAnswer[],
  skipped: readonly string[] = [],
): {
  body: string;
  omitted: number;
} {
  const skips = skippedLine(skipped, SKIPS_IN_COMMENT);
  let body = MARKER;
  let omitted = 0;
  answers.forEach((answer, index) => {
    const part = `${index === 0 ? "\n" : "\n\n---\n\n"}${answer.rendered.markdown}`;
    if (body.length + part.length > COMMENT_LIMIT - 200 - skips.length) {
      omitted += answer.data.dependencies.length;
      return;
    }
    body += part;
  });
  if (omitted > 0) {
    body += `\n\n_${omitted} more ${omitted === 1 ? "package is" : "packages are"} in this run's job summary; one comment holds 65,536 characters._`;
  }
  if (skips) body += `\n\n${skips}`;
  return { body, omitted };
}

/** The job summary holds a megabyte, so it gets every batch whole. */
export function summaryBody(
  answers: readonly ApiAnswer[],
  skipped: readonly string[] = [],
): string {
  const body = answers
    .map((answer) => answer.rendered.markdown)
    .join("\n\n---\n\n");
  const skips = skippedLine(skipped);
  return skips ? `${body}\n\n${skips}` : body;
}

/** Shown when the PR changes no dependency this Action could read. */
export function emptyBody(skipped: readonly string[]): string {
  const lines = [
    MARKER,
    "### Upgrade notes from What's New",
    "",
    "No dependency version changes found in this pull request.",
  ];
  if (skipped.length) {
    lines.push("", skippedLine(skipped, SKIPS_IN_COMMENT));
  }
  return lines.join("\n");
}
