// What any PR changes, read from GitHub's dependency graph: the compare
// endpoint (`GET /repos/{owner}/{repo}/dependency-graph/compare/{base}...{head}`)
// lists every dependency a manifest or lockfile added or removed between two
// commits, each with a purl. A version bump is one `removed` and one `added`
// for the same package in the same manifest. This is what covers Renovate and
// human PRs; it answers for public repositories, and for private ones with
// GitHub Advanced Security (a 403 otherwise, which the caller treats as "this
// source has nothing").

import type { Bump } from "../types.ts";

/** One entry of the compare endpoint's answer — the fields read here. */
export interface DependencyChange {
  change_type: "added" | "removed" | string;
  manifest: string;
  ecosystem: string;
  name: string;
  version: string;
  package_url: string | null;
}

/** `pkg:npm/%40scope/name@1.2.3?x=y#sub` → `pkg:npm/%40scope/name`. */
export function versionless(purl: string): string {
  const cut = purl.search(/[@?#](?![^/]*\/)/);
  return cut < 0 ? purl : purl.slice(0, cut);
}

/**
 * The version as the API can read it, or undefined for a range or a tag that
 * names no version. GitHub writes a workflow's floating `actions/checkout@v4`
 * as `4.*.*`, which is the major tag the API reads as the newest 4.x.
 */
export function exactVersion(version: string): string | undefined {
  const trimmed = version.trim();
  const floating = /^v?(\d+)(?:\.\*){1,2}$/.exec(trimmed);
  if (floating) return floating[1];
  if (/^v?\d[\w.+-]*$/.test(trimmed)) return trimmed;
  return undefined;
}

/**
 * Removed/added pairs, one bump each. A package added or removed outright is
 * not an upgrade and is left out; so is a pair either side of which is a range.
 */
export function pairChanges(changes: readonly DependencyChange[]): Bump[] {
  const key = (change: DependencyChange) =>
    `${change.manifest}\n${change.package_url ? versionless(change.package_url) : `${change.ecosystem}:${change.name}`}`;
  const removed = new Map<string, DependencyChange>();
  for (const change of changes) {
    if (change.change_type === "removed") removed.set(key(change), change);
  }
  const bumps: Bump[] = [];
  const seen = new Set<string>();
  for (const change of changes) {
    if (change.change_type !== "added") continue;
    const id = key(change);
    const before = removed.get(id);
    if (!before || seen.has(id)) continue;
    const from = exactVersion(before.version);
    const to = exactVersion(change.version);
    if (!from || !to || from === to) continue;
    seen.add(id);
    const purl = change.package_url
      ? versionless(change.package_url)
      : undefined;
    bumps.push({
      source: "dependency-graph",
      ecosystem: purl ? (/^pkg:([^/]+)\//.exec(purl)?.[1] ?? "") : "",
      name: change.name,
      from,
      to,
      purl,
      directory: change.manifest,
    });
  }
  return bumps;
}
