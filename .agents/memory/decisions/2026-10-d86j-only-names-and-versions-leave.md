---
id: "2026-10.d86j"
slug: only-names-and-versions-leave
title: "only names and versions leave the repository"
date: 2026-10-13
topics: [privacy, api]
---

# ADR 2026-10.d86j — only names and versions leave the repository

Status: Accepted (2026-10-13)

**Context:** the action runs inside other people's repositories, often private
ones, and sends a list of their dependencies to a third-party service. A
monorepo's lockfile lists its own workspace packages, and a company's lists
packages from a private registry. What's New's `recordMisses` (default true)
counts an untracked Maven, Go or NuGet package once deps.dev confirms it is
public, which is how its catalog grows. The skills repo settled the same
question for agents (whatsnew-fyi/skills ADR 2026-09.wez2): private packages are
left out, not sent with a flag.

**Decision:** each request carries a package's name or purl and its two
versions, and `recordMisses`. Nothing else: no repository name, no file
contents, no token, no PR text.

- `exclude` globs keep named packages from being sent at all, and every skip
  is reported in the log and the comment.
- `record-misses: auto` sends `true` for public repositories and `false` for
  private ones, read from the event's `repository.private`. A private
  repository's untracked packages are usually its own, and the server would
  only discard them after a deps.dev lookup.
- The User-Agent is `whatsnew-upgrade-notes-action/<version>` and a link to
  this repository. It names the client, which is how What's New counts
  integrations, and not the caller.

**Consequences / limits:** the action cannot tell a private npm package from a
public one without `node_modules`, which a PR workflow does not install. So
`exclude` is the only guard for private packages, and the README says so.
`test/run.test.ts` covers `exclude` and the visibility default;
`test/api.test.ts` asserts the request body holds only the dependencies and
`recordMisses`.

**Amended 2026-10-15.** Until 1.0.2 only the comment that answered nothing
named its skips. The first real Gradle group (getknit/knit-spool PR 8) dropped
`gradle-wrapper` and three plugin ids without a word in the log or the comment.
Now each skip is a log line and a `Skipped:` line closing every comment and
job summary, and a skip repeated across manifests is said once. Those four
names are no longer skipped: a plugin id is sent as its marker artifact, the
wrapper as `pkg:github/gradle/gradle`. `test/run.test.ts` holds both.
