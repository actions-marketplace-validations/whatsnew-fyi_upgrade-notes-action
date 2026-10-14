// The shapes the Action passes between its parts. `Bump` is what a source
// (Dependabot's commit message, GitHub's dependency graph, the Renovate preset's
// markers) says changed; `ApiDependency` is what What's New's API takes.

export type SourceName = "dependabot" | "dependency-graph" | "renovate";

/** One package moved from one version to another in this PR. */
export interface Bump {
  source: SourceName;
  /**
   * The ecosystem as the source names it: Dependabot's branch segment
   * (`npm_and_yarn`, `github_actions`), the dependency graph's purl type
   * (`npm`, `githubactions`), or Renovate's datasource (`npm`, `github-tags`).
   */
  ecosystem: string;
  name: string;
  from: string;
  to: string;
  /** A versionless purl, when the source gave one. */
  purl?: string;
  /** The manifest directory, when the source says. Display only. */
  directory?: string;
}

/** The four registries the API takes by name; everything else goes by purl. */
export type Registry = "npm" | "pypi" | "crates" | "rubygems";

/** One entry of `POST /api/v1/upgrade-notes`'s `dependencies`. */
export interface ApiDependency {
  name: string;
  from: string;
  to?: string;
  purl?: string;
  registry?: Registry;
}

/** What the API answers per dependency — the fields this Action reads. */
export interface AnsweredDependency {
  name: string;
  from: string;
  to?: string;
  status: string;
  signals?: {
    majorBump: boolean;
    breakingMentions: number;
    removed: number;
    deprecated: number;
    security: number;
    cves: string[];
  };
  releases?: Array<{ sections?: Array<{ key: string }> }>;
  compareUrl?: string;
}

/** One `POST /api/v1/upgrade-notes?render=markdown` answer. */
export interface ApiAnswer {
  data: { dependencies: AnsweredDependency[]; notes?: string[] };
  meta: { attribution: string; terms: string; license: string };
  rendered: { markdown: string; truncated: boolean };
}
