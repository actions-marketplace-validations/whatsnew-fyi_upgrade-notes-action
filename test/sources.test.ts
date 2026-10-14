import { describe, expect, it } from "vitest";
import {
  ecosystemOf,
  parseDependabotMessage,
} from "../src/sources/dependabot.ts";
import {
  exactVersion,
  pairChanges,
  versionless,
} from "../src/sources/dependency-graph.ts";
import { parseRenovateBody } from "../src/sources/renovate.ts";
import {
  change,
  DEPENDABOT_ACTIONS,
  DEPENDABOT_GROUP,
  DEPENDABOT_SAME_NAME,
  DEPENDABOT_SINGLE,
  renovateMarker,
} from "./fixtures.ts";

describe("parseDependabotMessage", () => {
  it("reads a single update from the YAML block and the Bumps line", () => {
    expect(
      parseDependabotMessage(
        DEPENDABOT_SINGLE,
        "dependabot/npm_and_yarn/lodash-4.17.21",
      ),
    ).toEqual([
      {
        source: "dependabot",
        ecosystem: "npm_and_yarn",
        name: "lodash",
        from: "4.17.20",
        to: "4.17.21",
      },
    ]);
  });

  it("reads every package of a group from its own Updates line", () => {
    expect(
      parseDependabotMessage(
        DEPENDABOT_GROUP,
        "dependabot/npm_and_yarn/npm_and_yarn-1a2b3c4d5e",
      ).map((bump) => [bump.name, bump.from, bump.to]),
    ).toEqual([
      ["next", "15.5.0", "16.0.0"],
      ["better-auth", "1.6.21", "1.7.1"],
    ]);
  });

  it("keeps two majors of one package apart, in order", () => {
    expect(
      parseDependabotMessage(
        DEPENDABOT_SAME_NAME,
        "dependabot/npm_and_yarn/production-abc123",
      ).map((bump) => [bump.from, bump.to]),
    ).toEqual([
      ["2.3.1", "2.3.2"],
      ["4.0.1", "4.0.2"],
    ]);
  });

  it("takes an unquoted YAML version from the message text, not as a number", () => {
    expect(
      parseDependabotMessage(
        DEPENDABOT_ACTIONS,
        "dependabot/github_actions/actions/checkout-5",
      ),
    ).toEqual([
      {
        source: "dependabot",
        ecosystem: "github_actions",
        name: "actions/checkout",
        from: "4",
        to: "5",
      },
    ]);
  });

  it("reads a CRLF message the same way", () => {
    expect(
      parseDependabotMessage(
        DEPENDABOT_SINGLE.replace(/\n/g, "\r\n"),
        "dependabot/npm_and_yarn/lodash-4.17.21",
      ),
    ).toHaveLength(1);
  });

  it("names nothing for a message without the YAML block, or off a Dependabot branch", () => {
    expect(
      parseDependabotMessage("fix: a thing", "dependabot/npm_and_yarn/x-1"),
    ).toEqual([]);
    expect(parseDependabotMessage(DEPENDABOT_SINGLE, "main")).toEqual([]);
  });

  it("drops a package whose installed version the message does not state", () => {
    const message = DEPENDABOT_GROUP.replace(
      "Updates `better-auth` from 1.6.21 to 1.7.1",
      "Updates `better-auth` to 1.7.1",
    );
    expect(
      parseDependabotMessage(message, "dependabot/npm_and_yarn/g-1").map(
        (bump) => bump.name,
      ),
    ).toEqual(["next"]);
  });

  it("reads the ecosystem whatever delimiter the branch uses", () => {
    expect(ecosystemOf("dependabot/pip/requests-2.32.0")).toBe("pip");
    expect(ecosystemOf("dependabot-go_modules-golang.org-x-net-0.30.0")).toBe(
      "go_modules",
    );
    expect(ecosystemOf("renovate/lodash-4.x")).toBeUndefined();
  });
});

describe("dependency graph", () => {
  it("pairs a removed and an added version of one package in one manifest", () => {
    const bumps = pairChanges([
      change("removed", "next", "15.5.0"),
      change("added", "next", "16.0.0"),
      change("removed", "@types/node", "24.0.0"),
      change("added", "@types/node", "24.1.0"),
    ]);
    expect(bumps).toEqual([
      {
        source: "dependency-graph",
        ecosystem: "npm",
        name: "next",
        from: "15.5.0",
        to: "16.0.0",
        purl: "pkg:npm/next",
        directory: "package-lock.json",
      },
      expect.objectContaining({
        name: "@types/node",
        purl: "pkg:npm/%40types/node",
      }),
    ]);
  });

  it("reads a floating action tag as its major", () => {
    const actions = {
      manifest: ".github/workflows/ci.yml",
      ecosystem: "actions",
    };
    const bumps = pairChanges([
      change("removed", "actions/checkout", "4.*.*", {
        ...actions,
        package_url: "pkg:githubactions/actions/checkout@4.*.*",
      }),
      change("added", "actions/checkout", "5.*.*", {
        ...actions,
        package_url: "pkg:githubactions/actions/checkout@5.*.*",
      }),
    ]);
    expect(bumps).toEqual([
      expect.objectContaining({
        from: "4",
        to: "5",
        purl: "pkg:githubactions/actions/checkout",
        ecosystem: "githubactions",
      }),
    ]);
  });

  it("leaves out additions, removals, ranges and unchanged versions", () => {
    expect(
      pairChanges([
        change("added", "zod", "4.1.0"),
        change("removed", "left-pad", "1.3.0"),
        change("removed", "react", "^19.0.0", { manifest: "package.json" }),
        change("added", "react", "^19.1.0", { manifest: "package.json" }),
        change("removed", "same", "1.0.0", { manifest: "a/package-lock.json" }),
        change("added", "same", "1.0.0", { manifest: "a/package-lock.json" }),
      ]),
    ).toEqual([]);
  });

  it("strips a purl's version, qualifiers and subpath, and nothing in a scope", () => {
    expect(versionless("pkg:npm/%40scope/name@1.2.3?x=y#sub")).toBe(
      "pkg:npm/%40scope/name",
    );
    expect(versionless("pkg:npm/@scope/name@1.2.3")).toBe(
      "pkg:npm/@scope/name",
    );
    expect(versionless("pkg:maven/org.a/b")).toBe("pkg:maven/org.a/b");
  });

  it("knows a version from a range", () => {
    expect(exactVersion("1.2.3")).toBe("1.2.3");
    expect(exactVersion("v2.0.0-rc.1")).toBe("v2.0.0-rc.1");
    expect(exactVersion("3.20-alpine")).toBe("3.20-alpine");
    expect(exactVersion("4.*")).toBe("4");
    expect(exactVersion("^1.2.3")).toBeUndefined();
    expect(exactVersion(">= 1.0, < 2")).toBeUndefined();
    expect(exactVersion("latest")).toBeUndefined();
  });
});

describe("parseRenovateBody", () => {
  it("reads one marker per upgrade, preferring the registry's package name", () => {
    const body = [
      "This PR contains the following updates:",
      "| Package | Change |",
      renovateMarker({
        depName: "checkout",
        packageName: "actions/checkout",
        currentVersion: "v4",
        newVersion: "v5",
        datasource: "github-tags",
      }),
      renovateMarker({
        depName: "next",
        currentVersion: "15.5.0",
        newVersion: "16.0.0",
        datasource: "npm",
        sourceUrl: "https://github.com/vercel/next.js",
      }),
    ].join("\n\n");
    expect(parseRenovateBody(body)).toEqual([
      {
        source: "renovate",
        ecosystem: "github-tags",
        name: "actions/checkout",
        from: "v4",
        to: "v5",
      },
      {
        source: "renovate",
        ecosystem: "npm",
        name: "next",
        from: "15.5.0",
        to: "16.0.0",
      },
    ]);
  });

  it("skips a marker it cannot read, one missing a version, and a repeat", () => {
    const next = renovateMarker({
      depName: "next",
      currentVersion: "15.5.0",
      newVersion: "16.0.0",
      datasource: "npm",
    });
    const body = [
      "<!--whatsnew:not-base64!-->",
      `<!--whatsnew:${Buffer.from("{nope").toString("base64")}-->`,
      renovateMarker({ depName: "x", newVersion: "1.0.0", datasource: "npm" }),
      next,
      next,
    ].join("\n");
    expect(parseRenovateBody(body)).toHaveLength(1);
    expect(parseRenovateBody(null)).toEqual([]);
  });
});
