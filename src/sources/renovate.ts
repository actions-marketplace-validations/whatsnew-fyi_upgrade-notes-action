// What a Renovate PR updates, read from the markers this repository's preset
// (`default.json`, `extends: ["github>whatsnew-fyi/upgrade-notes-action"]`)
// puts in the PR body. Renovate compiles `prBodyNotes` once per upgrade, so
// each package gets one hidden comment:
//
//   <!--whatsnew:eyJkZXBOYW1lIjoi…-->
//
// whose payload is base64 JSON with `depName`, `packageName`, `currentVersion`,
// `newVersion`, `datasource` and `sourceUrl`. Base64 because a version or a URL
// can hold `--`, which would end an HTML comment early. Renovate's own visible
// table and branch name are configurable, so neither is parsed.

import type { Bump } from "../types.ts";

const MARKER = /<!--whatsnew:([A-Za-z0-9+/=]{1,4000})-->/g;

interface RenovateNote {
  depName?: unknown;
  packageName?: unknown;
  currentVersion?: unknown;
  newVersion?: unknown;
  datasource?: unknown;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function parseRenovateBody(body: string | null | undefined): Bump[] {
  const bumps: Bump[] = [];
  const seen = new Set<string>();
  for (const match of (body ?? "").matchAll(MARKER)) {
    let note: RenovateNote;
    try {
      note = JSON.parse(
        Buffer.from(match[1] ?? "", "base64").toString("utf8"),
      ) as RenovateNote;
    } catch {
      continue;
    }
    // `packageName` is the registry's name for it (`actions/checkout`,
    // `com.google.guava:guava`); `depName` is what the manifest calls it.
    const name = text(note.packageName) ?? text(note.depName);
    const from = text(note.currentVersion);
    const to = text(note.newVersion);
    const ecosystem = text(note.datasource);
    if (!name || !from || !to || !ecosystem) continue;
    const id = `${ecosystem}\n${name}\n${from}\n${to}`;
    if (seen.has(id)) continue;
    seen.add(id);
    bumps.push({ source: "renovate", ecosystem, name, from, to });
  }
  return bumps;
}
