// A bump as What's New's API takes it. The API reads a name in four
// registries (npm by default, `pypi`, `crates`, `rubygems`) and everything else
// by purl; a Maven coordinate or a Go module is never guessed by name, so those
// always go as a purl. This is the table `whatsnew-fyi/skills`'
// `outdated_to_deps.py` keeps for outdated reports, extended to the names
// Dependabot, the dependency graph and Renovate give each ecosystem.

import type { ApiDependency, Bump, Registry } from "./types.ts";

type Shape =
  | { kind: "registry"; registry: Registry }
  | { kind: "purl"; type: string }
  | { kind: "skip" };

/** Dependabot's branch segment, the graph's purl type, or Renovate's datasource. */
const SHAPES: Record<string, Shape> = {
  // npm and the package managers that read its registry.
  npm_and_yarn: { kind: "registry", registry: "npm" },
  npm: { kind: "registry", registry: "npm" },
  bun: { kind: "registry", registry: "npm" },
  // PyPI, under each of Dependabot's Python managers.
  pip: { kind: "registry", registry: "pypi" },
  pip_compile: { kind: "registry", registry: "pypi" },
  pipenv: { kind: "registry", registry: "pypi" },
  poetry: { kind: "registry", registry: "pypi" },
  uv: { kind: "registry", registry: "pypi" },
  pypi: { kind: "registry", registry: "pypi" },
  cargo: { kind: "registry", registry: "crates" },
  crate: { kind: "registry", registry: "crates" },
  bundler: { kind: "registry", registry: "rubygems" },
  gem: { kind: "registry", registry: "rubygems" },
  rubygems: { kind: "registry", registry: "rubygems" },
  go_modules: { kind: "purl", type: "golang" },
  golang: { kind: "purl", type: "golang" },
  go: { kind: "purl", type: "golang" },
  maven: { kind: "purl", type: "maven" },
  gradle: { kind: "purl", type: "maven" },
  nuget: { kind: "purl", type: "nuget" },
  github_actions: { kind: "purl", type: "github" },
  githubactions: { kind: "purl", type: "github" },
  "github-tags": { kind: "purl", type: "github" },
  "github-releases": { kind: "purl", type: "github" },
  "github-digest": { kind: "skip" },
  composer: { kind: "purl", type: "composer" },
  packagist: { kind: "purl", type: "composer" },
  docker: { kind: "purl", type: "docker" },
  docker_compose: { kind: "purl", type: "docker" },
  hex: { kind: "purl", type: "hex" },
  mix: { kind: "purl", type: "hex" },
  pub: { kind: "purl", type: "pub" },
  dart: { kind: "purl", type: "pub" },
  swift: { kind: "purl", type: "swift" },
};

/** A Gradle plugin id: two or more dotted segments, no `:`. */
const GRADLE_PLUGIN_ID = /^[A-Za-z][\w-]*(?:\.[\w-]+)+$/;

/** The Gradle distribution, which Gradle releases from gradle/gradle. */
const GRADLE_DISTRIBUTION = "pkg:github/gradle/gradle";

/**
 * The two names Dependabot's `gradle` ecosystem gives that are not
 * `group:artifact`. `gradle-wrapper` is the Gradle distribution itself. A
 * plugin goes by its id (`org.jetbrains.kotlin.jvm`), and every plugin is
 * published with a marker artifact `<id>:<id>.gradle.plugin`, which is how
 * What's New reads a plugin id too: the marker's group is the id, so a product
 * claiming `pkg:maven/org.jetbrains.kotlin/*` answers for it. Renovate already
 * sends the marker as its `packageName`.
 */
function gradlePurl(name: string): string | undefined {
  if (name === "gradle-wrapper") return GRADLE_DISTRIBUTION;
  return GRADLE_PLUGIN_ID.test(name)
    ? `pkg:maven/${name}/${name}.gradle.plugin`
    : undefined;
}

/** `group:artifact` → `group/artifact`; a Go module path stays as it is. */
function purlPath(type: string, name: string): string | undefined {
  if (type === "maven") {
    const [group, artifact] = name.split(":");
    return group && artifact ? `${group}/${artifact}` : undefined;
  }
  if (type === "github") {
    // `github/codeql-action/init` is the repository `github/codeql-action`.
    const [owner, repo] = name.split("/");
    return owner && repo ? `${owner}/${repo}` : undefined;
  }
  if (type === "nuget" || type === "pub" || type === "hex") return name;
  return name.replace(/^@/, "%40");
}

/**
 * The API's identity for a bump, or why it has none. A purl from the
 * dependency graph is used as given (with GitHub's `githubactions` type
 * renamed to the spec's `github`); otherwise the ecosystem's row decides.
 */
export function toApiDependency(
  bump: Bump,
): { dependency: ApiDependency } | { skip: string } {
  const base = { name: bump.name, from: bump.from, to: bump.to };
  if (bump.purl) {
    const purl = bump.purl.replace(/^pkg:githubactions\//, "pkg:github/");
    if (purl.startsWith("pkg:github/")) {
      const path = purlPath("github", purl.slice("pkg:github/".length));
      return path
        ? { dependency: { ...base, purl: `pkg:github/${path}` } }
        : { skip: "an action without an owner and repository" };
    }
    return { dependency: { ...base, purl } };
  }
  // Renovate's datasource for the Gradle wrapper.
  if (bump.ecosystem === "gradle-version") {
    return { dependency: { ...base, purl: GRADLE_DISTRIBUTION } };
  }
  if (bump.ecosystem === "gradle" && !bump.name.includes(":")) {
    const purl = gradlePurl(bump.name);
    if (purl) return { dependency: { ...base, purl } };
  }
  const shape = SHAPES[bump.ecosystem];
  if (!shape || shape.kind === "skip") {
    return { skip: `the ${bump.ecosystem} ecosystem is not covered` };
  }
  if (shape.kind === "registry") {
    return {
      dependency:
        shape.registry === "npm" ? base : { ...base, registry: shape.registry },
    };
  }
  const path = purlPath(shape.type, bump.name);
  if (!path) return { skip: `"${bump.name}" is not a ${shape.type} name` };
  return { dependency: { ...base, purl: `pkg:${shape.type}/${path}` } };
}

/** A glob (`@acme/*`, `internal-*`) as an anchored, case-sensitive pattern. */
function globPattern(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\*/g, ".*").replace(/\?/g, ".")}$`);
}

/** Whether a package name matches any `exclude` glob — private packages stay home. */
export function excluded(name: string, globs: readonly string[]): boolean {
  return globs.some((glob) => globPattern(glob).test(name));
}
