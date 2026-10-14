// What a Dependabot PR updates, read from its commit message — the same
// reading `dependabot/fetch-metadata` does (MIT; `src/dependabot/update_metadata.ts`),
// redone here so a workflow needs no extra step. Dependabot writes:
//
//   Bumps [lodash](…) from 4.17.20 to 4.17.21.            ← one update
//   Bumps the npm_and_yarn group with 2 updates …          ← a group, then
//   Updates `a` from 1.0.0 to 1.1.0                        ←   one line each
//   ---
//   updated-dependencies:                                   ← the YAML block,
//   - dependency-name: lodash                               ←   one per package
//     dependency-version: 4.17.21                           ←   (newer messages)
//   ...
//
// The YAML block is the list of names; the versions come from the per-package
// `Updates` lines, then `dependency-version`, then (first package only) the
// `Bumps` line. The branch, `dependabot/<ecosystem>/<directory…>/<name>-<version>`,
// names the ecosystem.

import { parse as parseYaml } from "yaml";
import type { Bump } from "../types.ts";

const BUMPS = /^Bumps .* from (?<from>v?\d[^ ]*) to (?<to>v?\d[^ ]*)\.$/m;
const REQUIREMENT =
  /\b[Uu]pdate .* requirement from \S*? ?(?<from>v?\d\S*) to \S*? ?(?<to>v?\d\S*)/;
const UPDATES =
  /^Updates `(?<name>\S+)` (?:from (?<from>\S+) )?to (?<to>\S+)$/gm;
const YAML_BLOCK = /^-{3}\n(?<yaml>[\s\S]*?)\n^\.{3}$/m;

interface Versions {
  from: string;
  to: string;
}

function updatesLines(message: string): Map<string, Versions[]> {
  const byName = new Map<string, Versions[]>();
  for (const match of message.matchAll(UPDATES)) {
    const groups = match.groups;
    if (!groups?.name || !groups.to) continue;
    const list = byName.get(groups.name) ?? [];
    list.push({ from: groups.from ?? "", to: groups.to });
    byName.set(groups.name, list);
  }
  return byName;
}

/** `dependabot/npm_and_yarn/…` → `npm_and_yarn`; the 11th character is the delimiter. */
export function ecosystemOf(branch: string): string | undefined {
  if (!branch.startsWith("dependabot") || branch.length < 12) return undefined;
  const delimiter = branch[10] ?? "/";
  return branch.split(delimiter)[1] || undefined;
}

/**
 * Every package a Dependabot commit message names, with the versions it moves
 * between. A package whose `from` the message does not state is dropped: the
 * API needs the installed version, and a guess would be worse than nothing.
 */
export function parseDependabotMessage(
  message: string,
  branch: string,
): Bump[] {
  const text = message.replace(/\r\n?/g, "\n");
  const ecosystem = ecosystemOf(branch);
  const block = YAML_BLOCK.exec(text)?.groups?.yaml;
  if (!ecosystem || !block) return [];

  let data: unknown;
  try {
    data = parseYaml(block);
  } catch {
    return [];
  }
  const listed = (data as { "updated-dependencies"?: unknown })?.[
    "updated-dependencies"
  ];
  if (!Array.isArray(listed)) return [];

  const firstLine = text.split("\n")[0] ?? "";
  const top =
    BUMPS.exec(text)?.groups ?? REQUIREMENT.exec(firstLine)?.groups ?? {};
  const updates = updatesLines(text);
  const seen = new Map<string, number>();

  const bumps: Bump[] = [];
  listed.forEach((entry: unknown, index) => {
    const record = entry as Record<string, unknown>;
    const name = record["dependency-name"];
    if (typeof name !== "string" || !name) return;
    // A name can appear twice (two `picomatch` majors in one group); the
    // `Updates` lines are in the same order as the YAML entries.
    const nth = seen.get(name) ?? 0;
    seen.set(name, nth + 1);
    const line = updates.get(name)?.[nth];
    const version = record["dependency-version"];
    const from = line?.from || (index === 0 ? (top.from ?? "") : "");
    const to =
      (typeof version === "string" && version) ||
      line?.to ||
      (index === 0 ? (top.to ?? "") : "");
    if (!from || !to) return;
    bumps.push({ source: "dependabot", ecosystem, name, from, to });
  });
  return bumps;
}
