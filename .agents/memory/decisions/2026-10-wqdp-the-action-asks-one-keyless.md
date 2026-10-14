---
id: "2026-10.wqdp"
slug: the-action-asks-one-keyless
title: "the action asks one keyless API and posts one comment"
date: 2026-10-13
topics: [architecture, api]
---

# ADR 2026-10.wqdp — the action asks one keyless API and posts one comment

Status: Accepted (2026-10-13)

**Context:** a dependency-bump PR is where a developer decides whether a new
version is safe. Dependabot and Renovate copy the upstream GitHub release text
into their PR bodies, but neither pulls out a breaking change shipped in a
minor, the migration notes inside a long body, a CVE roll-up across the range,
or anything for a product that does not publish on GitHub. Neither accepts a
notes source either: Renovate's `fetchChangeLogs` reads GitHub, GitLab and
Bitbucket only, and Dependabot has no extension point. What's New's
`POST /api/v1/upgrade-notes` already answers the question per package, keyless
(whatsnew-app ADR 2026-09.9te8, 2026-10.qz7v).

**Decision:** a JavaScript action (`node24`, one ESM bundle in `dist/`) that
reads which packages the PR moves, asks that endpoint once per 20 packages,
and edits a single comment it finds again by a hidden marker.

- **The server renders the comment** (`?render=markdown`, whatsnew-app ADR
  2026-10.b8yg), and one call returns it beside the JSON the outputs read.
  This action never formats notes. The labels and attribution every quote
  owes stay with the server that owes them, the vendor text is made inert
  there (no `@mentions`, no issue backlinks), and a later GitLab component is
  curl and jq rather than a second renderer.
- **Three sources, first that names a bump wins.** Dependabot's commit message,
  read the way `dependabot/fetch-metadata` reads it so a workflow needs no
  extra step; then the Renovate preset's markers (`default.json`), because
  Renovate's own table and branch names are configurable and its
  `renovate-debug` comment lists no packages; then GitHub's dependency-graph
  compare, which covers human PRs and any bot, for public repositories and
  private ones with Advanced Security. A 403 there is "nothing from this
  source", not an error.
- **No secret, no `pull_request_target`.** Dependabot-triggered `pull_request`
  runs get a read-only token and no Actions secrets, but `permissions:
  pull-requests: write` raises the token, and the API needs no key. The
  alternative, `pull_request_target` or `workflow_run`, runs with write access
  against a PR's code and is the classic "pwn request". It buys nothing here.
- **It never blocks a merge on its own account.** An API failure, a refusal or
  a missing permission is a warning and a clean exit. The step fails only when
  `fail-on` names a signal the answer carries, and only after commenting.

**Consequences / limits:**

- **Coverage is the catalog's.** A package What's New does not track is listed
  as not tracked, with a link to suggest it. On 2026-10-13 that included every
  `actions/*` action, so most `github-actions` bumps answer nothing until
  those are curated in whatsnew-app.
- **Ranges are not versions.** The dependency graph reports a manifest without
  a lockfile as `^1.2.3`; those pairs are dropped rather than guessed into an
  installed version. A floating Actions tag (`4.*.*`) is read as its major,
  which the server resolves to the newest release of that major.
- **Past 20 packages the batches are joined** into one comment, and any that
  would pass GitHub's 65,536-character limit go to the job summary only.
- **The bundle is committed**, because an action runs from the tagged tree.
  CI rebuilds it and fails on any diff (`npm run check-dist`).
- **What keeps it true:** `test/sources.test.ts` (the message formats
  fetch-metadata's tests record, group and same-name entries, unquoted YAML
  versions, CRLF, the graph's pairing and range rules, marker parsing),
  `test/run.test.ts` (source order, one comment edited not repeated,
  `fail-on` only after commenting, API failure and a 403 as warnings),
  `test/api.test.ts` (batching, one retry, the User-Agent).
