# What's New upgrade notes

A GitHub Action that comments on dependency pull requests with what the vendor
says changed between the version you run and the one you're moving to: breaking
changes, migration steps, deprecations, removals and CVE fixes, quoted from the
vendor's own release notes and linked.

It works on Dependabot and Renovate PRs, and on any PR that bumps a lockfile.
It needs no API key and no secrets.

```text
### Upgrade notes from What's New

| Package     | Update          | Releases | Flags                   |
| :--         | :--             | --:      | :--                     |
| better-auth | 1.6.21 → 1.7.1  | 14       | 1 breaking, 1 removed   |
| next        | 15.5.0 → 16.0.0 | 3        | major version, 1 security |

#### better-auth 1.6.21 → 1.7.1
v1.7.0 · 2026-08-18 · breaking, removed · vendor notes · What's New
> ❗ Breaking Changes · under better-auth
> - Moved database joins out of `experimental` into `advanced.database.joins`
>   > Migration: Replace `experimental: { joins: true }` with …
```

## Why

A SemVer label says what the version number claims. Release notes say what
shipped, and they disagree often enough to matter: better-auth 1.7.0 is a minor
release with a breaking-changes section and a migration note under each item. Dependabot and Renovate paste upstream release
text into the PR, but a reviewer still has to read every release in the range to
find the one paragraph that breaks the build.

This action reads the range for you. The notes come from
[What's New](https://whatsnew.fyi), which tracks release notes for about 1,700
products from GitHub releases, changelogs, vendor sites and package registries.
Each package gets the vendor's own breaking, migration, deprecation and security
sections, verbatim, and its flags are counted across every release in the range.

## Usage

### Dependabot

```yaml
# .github/workflows/upgrade-notes.yml
name: Upgrade notes
on: pull_request

permissions:
  contents: read
  pull-requests: write

jobs:
  notes:
    if: github.event.pull_request.user.login == 'dependabot[bot]'
    runs-on: ubuntu-latest
    steps:
      - uses: whatsnew-fyi/upgrade-notes-action@v1
```

Dependabot PRs run with a read-only token and without your Actions secrets. The
`permissions` block is enough to let this action comment, and it needs nothing
else. Don't switch to `pull_request_target`.

### Renovate

Add the preset so each upgrade carries a hidden marker this action reads:

```json
{
  "extends": ["config:recommended", "github>whatsnew-fyi/upgrade-notes-action"]
}
```

Then use the same workflow, with `if: github.event.pull_request.user.login ==
'renovate[bot]'` or no `if` at all. In public repositories the action also
works without the preset, from GitHub's dependency graph.

### Any pull request

Drop the `if` and the action runs on every PR. When a PR doesn't bump a
dependency it does nothing, and if a later push removes a bump, it replaces its
earlier comment. Human PRs are read from GitHub's dependency graph, which
answers for public repositories and for private ones with GitHub Advanced
Security.

### Auto-merge only what the notes call safe

`fetch-metadata` tells you the SemVer update type. This tells you whether the
vendor's notes mention a breaking change or a removal, which catches the ones
shipped in a minor:

```yaml
jobs:
  automerge:
    if: github.event.pull_request.user.login == 'dependabot[bot]'
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - id: notes
        uses: whatsnew-fyi/upgrade-notes-action@v1
      - if: steps.notes.outputs.breaking == 'false'
        run: gh pr merge --auto --squash "$PR_URL"
        env:
          PR_URL: ${{ github.event.pull_request.html_url }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Inputs

| Input | Default | What it does |
| :-- | :-- | :-- |
| `github-token` | `github.token` | Reads the PR and posts the comment. |
| `comment` | `auto` | `auto` comments when the PR moves a dependency. `always` also comments when it moves none. `never` writes only the job summary and outputs. |
| `fail-on` | `none` | `breaking`, `security`, or both comma-separated: fail the step when the notes show it. The comment is posted first. |
| `record-misses` | `auto` | Let What's New count Maven, Go and NuGet packages it doesn't track yet, once deps.dev confirms they're public. `auto` is on for public repositories and off for private ones. |
| `exclude` | | Package names never sent, as globs: `@acme/*`, `internal-*`. |
| `api-url` | `https://whatsnew.fyi` | Change only to test against a preview deployment. |

## Outputs

| Output | Value |
| :-- | :-- |
| `breaking` | `true` when any package's notes show a breaking change (the vendor's wording or a breaking-changes heading), a removal, or a major version. |
| `security` | `true` when any range includes a security fix or a CVE id. |
| `cves` | CVE ids fixed across the update, comma-separated. |
| `dependencies` | Packages sent. |
| `answered` | Packages What's New could compare. |
| `json` | Path to the full answer as JSON. |

## What it sends

For each package: its name or package URL and the two versions. Nothing else
leaves the runner: no repository name, file contents, token or PR text. The
request goes to `https://whatsnew.fyi/api/v1/upgrade-notes` with the User-Agent
`whatsnew-upgrade-notes-action/<version>`.

A PR workflow doesn't install your packages, so the action can't tell a private
package from a public one. If your lockfiles name private packages, list them in
`exclude`.

## Coverage

What's New answers for the products it tracks. A package it doesn't track is
listed as "Not tracked yet" with a link to suggest it. Ecosystems: npm, PyPI,
crates.io, RubyGems, Maven and Gradle, Go, NuGet and GitHub Actions; Composer,
Docker, Hex, pub and Swift packages are sent by package URL and answered when a
tracked product claims them. Terraform and git submodules are skipped.

## Licence and attribution

The action is MIT-licensed. The notes are the vendors' own words, quoted and
linked. The release facts (products, versions, dates, links, CVE ids, flags)
are open data under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/);
the change lists and labels are covered by the
[What's New terms](https://whatsnew.fyi/terms#reuse). Every comment carries
the attribution.

The same answers are available as JSON from the
[What's New API](https://whatsnew.fyi/api/v1/openapi.json) and as an
[MCP server](https://whatsnew.fyi/mcp/setup) for coding agents.
