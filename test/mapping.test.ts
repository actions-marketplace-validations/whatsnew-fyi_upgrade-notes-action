import { describe, expect, it } from "vitest";
import { excluded, toApiDependency } from "../src/ecosystems.ts";
import { parseInputs } from "../src/inputs.ts";
import type { Bump } from "../src/types.ts";

function bump(ecosystem: string, name: string, over: Partial<Bump> = {}): Bump {
  return {
    source: "dependabot",
    ecosystem,
    name,
    from: "1.0.0",
    to: "2.0.0",
    ...over,
  };
}

function mapped(b: Bump) {
  const result = toApiDependency(b);
  if ("skip" in result) throw new Error(result.skip);
  return result.dependency;
}

describe("toApiDependency", () => {
  it("sends npm by name, the default registry", () => {
    expect(mapped(bump("npm_and_yarn", "@tanstack/react-query"))).toEqual({
      name: "@tanstack/react-query",
      from: "1.0.0",
      to: "2.0.0",
    });
  });

  it("names the registry for PyPI, crates.io and RubyGems, under every manager", () => {
    expect(mapped(bump("uv", "httpx")).registry).toBe("pypi");
    expect(mapped(bump("poetry", "httpx")).registry).toBe("pypi");
    expect(mapped(bump("cargo", "serde")).registry).toBe("crates");
    expect(mapped(bump("crate", "serde")).registry).toBe("crates");
    expect(mapped(bump("bundler", "rails")).registry).toBe("rubygems");
  });

  it("sends Maven, Go, NuGet and Actions as purls, never as a name to guess", () => {
    expect(mapped(bump("gradle", "com.google.guava:guava")).purl).toBe(
      "pkg:maven/com.google.guava/guava",
    );
    expect(mapped(bump("go_modules", "golang.org/x/net")).purl).toBe(
      "pkg:golang/golang.org/x/net",
    );
    expect(mapped(bump("nuget", "Newtonsoft.Json")).purl).toBe(
      "pkg:nuget/Newtonsoft.Json",
    );
    expect(
      mapped(bump("github_actions", "github/codeql-action/init")).purl,
    ).toBe("pkg:github/github/codeql-action");
    expect(mapped(bump("github-tags", "actions/checkout")).purl).toBe(
      "pkg:github/actions/checkout",
    );
  });

  it("uses a dependency-graph purl as given, renaming GitHub's action type", () => {
    expect(
      mapped(
        bump("npm", "next", {
          source: "dependency-graph",
          purl: "pkg:npm/next",
        }),
      ),
    ).toEqual({
      name: "next",
      from: "1.0.0",
      to: "2.0.0",
      purl: "pkg:npm/next",
    });
    expect(
      mapped(
        bump("githubactions", "actions/setup-node", {
          source: "dependency-graph",
          purl: "pkg:githubactions/actions/setup-node",
        }),
      ).purl,
    ).toBe("pkg:github/actions/setup-node");
  });

  it("sends a Gradle plugin id as its marker artifact, and the wrapper as Gradle itself", () => {
    expect(mapped(bump("gradle", "org.jetbrains.kotlin.jvm")).purl).toBe(
      "pkg:maven/org.jetbrains.kotlin.jvm/org.jetbrains.kotlin.jvm.gradle.plugin",
    );
    expect(mapped(bump("gradle", "com.diffplug.spotless")).purl).toBe(
      "pkg:maven/com.diffplug.spotless/com.diffplug.spotless.gradle.plugin",
    );
    expect(mapped(bump("gradle", "gradle-wrapper")).purl).toBe(
      "pkg:github/gradle/gradle",
    );
    // Renovate's datasource for the wrapper.
    expect(mapped(bump("gradle-version", "gradle")).purl).toBe(
      "pkg:github/gradle/gradle",
    );
    // A plugin id is Gradle's alone: Maven names its plugins `group:artifact`.
    expect(toApiDependency(bump("maven", "org.jetbrains.kotlin.jvm"))).toEqual({
      skip: '"org.jetbrains.kotlin.jvm" is not a maven name',
    });
    expect(toApiDependency(bump("gradle", "toolchain"))).toEqual({
      skip: '"toolchain" is not a maven name',
    });
  });

  it("skips what it cannot name, and says why", () => {
    expect(toApiDependency(bump("terraform", "hashicorp/aws"))).toEqual({
      skip: "the terraform ecosystem is not covered",
    });
    expect(toApiDependency(bump("maven", "guava"))).toEqual({
      skip: '"guava" is not a maven name',
    });
  });
});

describe("excluded", () => {
  it("matches whole names against globs", () => {
    expect(excluded("@acme/internal", ["@acme/*"])).toBe(true);
    expect(excluded("internal-api", ["internal-*"])).toBe(true);
    expect(excluded("my-internal-api", ["internal-*"])).toBe(false);
    expect(excluded("a.b", ["a?b"])).toBe(true);
    expect(excluded("next", [])).toBe(false);
  });
});

describe("parseInputs", () => {
  const defaults: Record<string, string> = {
    "github-token": "t",
    comment: "auto",
    "fail-on": "none",
    "record-misses": "auto",
    exclude: "",
    "api-url": "https://whatsnew.fyi",
  };
  const read =
    (over: Record<string, string> = {}) =>
    (name: string) =>
      ({ ...defaults, ...over })[name] ?? "";

  it("reads the defaults", () => {
    const inputs = parseInputs(read());
    expect(inputs.comment).toBe("auto");
    expect([...inputs.failOn]).toEqual([]);
    expect(inputs.recordMisses).toBe("auto");
    expect(inputs.apiUrl).toBe("https://whatsnew.fyi");
  });

  it("reads lists with commas or newlines", () => {
    const inputs = parseInputs(
      read({ "fail-on": "breaking, security", exclude: "@acme/*\ninternal-*" }),
    );
    expect([...inputs.failOn]).toEqual(["breaking", "security"]);
    expect(inputs.exclude).toEqual(["@acme/*", "internal-*"]);
  });

  it("refuses a value it does not know, naming the input", () => {
    expect(() => parseInputs(read({ comment: "sometimes" }))).toThrow(
      /^comment:/,
    );
    expect(() => parseInputs(read({ "fail-on": "major" }))).toThrow(
      /^fail-on:/,
    );
    expect(() => parseInputs(read({ "record-misses": "yes" }))).toThrow(
      /^record-misses:/,
    );
    expect(() =>
      parseInputs(read({ "api-url": "http://example.com" })),
    ).toThrow(/^api-url: use https/);
  });
});
