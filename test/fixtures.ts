// Inputs in the shapes the three sources really emit. The Dependabot messages
// follow the format `dependabot/fetch-metadata`'s own tests record (a `Bumps`
// line, per-package `Updates` lines for a group, the `updated-dependencies` YAML
// block between `---` and `...`); the graph entries follow the
// `dependency-graph/compare` response.

import type { DependencyChange } from "../src/sources/dependency-graph.ts";
import type { AnsweredDependency, ApiAnswer } from "../src/types.ts";

export const DEPENDABOT_SINGLE = `Bumps [lodash](https://github.com/lodash/lodash) from 4.17.20 to 4.17.21.
- [Release notes](https://github.com/lodash/lodash/releases)
- [Commits](https://github.com/lodash/lodash/compare/4.17.20...4.17.21)

---
updated-dependencies:
- dependency-name: lodash
  dependency-version: 4.17.21
  dependency-type: direct:production
  update-type: version-update:semver-patch
...

Signed-off-by: dependabot[bot] <support@github.com>`;

export const DEPENDABOT_GROUP = `Bumps the npm_and_yarn group with 2 updates in the / directory: [next](https://github.com/vercel/next.js) and [better-auth](https://github.com/better-auth/better-auth).


Updates \`next\` from 15.5.0 to 16.0.0
- [Release notes](https://github.com/vercel/next.js/releases)
- [Commits](https://github.com/vercel/next.js/compare/v15.5.0...v16.0.0)

Updates \`better-auth\` from 1.6.21 to 1.7.1
- [Release notes](https://github.com/better-auth/better-auth/releases)
- [Commits](https://github.com/better-auth/better-auth/compare/v1.6.21...v1.7.1)

---
updated-dependencies:
- dependency-name: next
  dependency-version: 16.0.0
  dependency-type: direct:production
  update-type: version-update:semver-major
  dependency-group: npm_and_yarn
- dependency-name: better-auth
  dependency-version: 1.7.1
  dependency-type: direct:production
  update-type: version-update:semver-minor
  dependency-group: npm_and_yarn
...

Signed-off-by: dependabot[bot] <support@github.com>`;

/**
 * A Gradle group, trimmed from a real one (getknit/knit-spool PR 8,
 * 2026-10-15): the wrapper, a library, a plugin listed once per manifest, and
 * a name no rule maps.
 */
export const DEPENDABOT_GRADLE = `Bumps the gradle group with 4 updates:

Updates \`gradle-wrapper\` from 9.5.0 to 9.8.1
- [Release notes](https://github.com/gradle/gradle/releases)
- [Commits](https://github.com/gradle/gradle/compare/v9.5.0...v9.8.1)

Updates \`org.xerial:sqlite-jdbc\` from 3.50.3.0 to 3.53.4.0
- [Release notes](https://github.com/xerial/sqlite-jdbc/releases)

Updates \`org.jetbrains.kotlin.plugin.serialization\` from 2.4.0 to 2.4.21
- [Release notes](https://github.com/JetBrains/kotlin/releases)

Updates \`org.jetbrains.kotlin.plugin.serialization\` from 2.4.0 to 2.4.21
- [Release notes](https://github.com/JetBrains/kotlin/releases)

Updates \`toolchain\` from 1.0.0 to 2.0.0

---
updated-dependencies:
- dependency-name: gradle-wrapper
  dependency-version: 9.8.1
  dependency-type: direct:production
  update-type: version-update:semver-minor
  dependency-group: gradle
- dependency-name: org.xerial:sqlite-jdbc
  dependency-version: 3.53.4.0
  dependency-type: direct:production
  update-type: version-update:semver-minor
  dependency-group: gradle
- dependency-name: org.jetbrains.kotlin.plugin.serialization
  dependency-version: 2.4.21
  dependency-type: direct:production
  update-type: version-update:semver-patch
  dependency-group: gradle
- dependency-name: org.jetbrains.kotlin.plugin.serialization
  dependency-version: 2.4.21
  dependency-type: direct:production
  update-type: version-update:semver-patch
  dependency-group: gradle
- dependency-name: toolchain
  dependency-version: 2.0.0
  dependency-type: direct:production
  update-type: version-update:semver-major
  dependency-group: gradle
...

Signed-off-by: dependabot[bot] <support@github.com>`;

/** Two majors of one package in one group, and no `dependency-version` keys (older messages). */
export const DEPENDABOT_SAME_NAME = `Bumps the production group with 2 updates:

Updates \`picomatch\` from 2.3.1 to 2.3.2
- [Release notes](https://github.com/micromatch/picomatch/releases)

Updates \`picomatch\` from 4.0.1 to 4.0.2
- [Release notes](https://github.com/micromatch/picomatch/releases)

---
updated-dependencies:
- dependency-name: picomatch
  dependency-type: indirect
  dependency-group: production
- dependency-name: picomatch
  dependency-type: indirect
  dependency-group: production
...

Signed-off-by: dependabot[bot] <support@github.com>`;

/** A workflow's floating major tag, which YAML would read as a number unquoted. */
export const DEPENDABOT_ACTIONS = `Bumps [actions/checkout](https://github.com/actions/checkout) from 4 to 5.
- [Release notes](https://github.com/actions/checkout/releases)

---
updated-dependencies:
- dependency-name: actions/checkout
  dependency-version: 5
  dependency-type: direct:production
  update-type: version-update:semver-major
...

Signed-off-by: dependabot[bot] <support@github.com>`;

export function change(
  change_type: "added" | "removed",
  name: string,
  version: string,
  over: Partial<DependencyChange> = {},
): DependencyChange {
  return {
    change_type,
    manifest: "package-lock.json",
    ecosystem: "npm",
    name,
    version,
    package_url: `pkg:npm/${name.replace(/^@/, "%40")}@${version}`,
    ...over,
  };
}

/** One Renovate preset marker, as `prBodyNotes` renders it. */
export function renovateMarker(note: Record<string, string>): string {
  return `<!--whatsnew:${Buffer.from(JSON.stringify(note)).toString("base64")}-->`;
}

export function answered(
  name: string,
  over: Partial<AnsweredDependency> = {},
): AnsweredDependency {
  return {
    name,
    from: "1.0.0",
    to: "1.1.0",
    status: "ok",
    signals: {
      majorBump: false,
      breakingMentions: 0,
      removed: 0,
      deprecated: 0,
      security: 0,
      cves: [],
    },
    ...over,
  };
}

export function answer(
  dependencies: AnsweredDependency[],
  markdown = "### Upgrade notes from What's New\n\n| table |",
): ApiAnswer {
  return {
    data: { dependencies },
    meta: {
      attribution: "Release facts from What's New (whatsnew.fyi), CC BY 4.0.",
      terms: "https://whatsnew.fyi/terms#reuse",
      license: "mixed",
    },
    rendered: { markdown, truncated: false },
  };
}
