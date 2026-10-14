---
changelog: "0.1"
product:
  name: What's New upgrade notes
  vendor: whatsnew.fyi
  homepage: https://github.com/whatsnew-fyi/upgrade-notes-action
  description: A GitHub Action that comments on dependency PRs with the vendor's breaking changes, migration notes, deprecations and CVE fixes.
  versioning: semver
  category: developer-tools
document:
  updated: 2026-10-14T00:00:00Z
  coverage: complete
  canonical: https://github.com/whatsnew-fyi/upgrade-notes-action/blob/main/CHANGELOG.md
---

# What's New upgrade notes changelog

This file is a [Declarative Changelog](https://whatsnew.fyi/spec), validated in CI.

## [1.0.0](https://github.com/whatsnew-fyi/upgrade-notes-action/releases/tag/v1.0.0) - 2026-10-14T00:00:00Z

> First release: one comment per dependency PR with the vendor's own notes for every version in between.

### Added

- Comment on Dependabot, Renovate and any lockfile-bumping PR with the vendor's breaking, migration, deprecation and security sections for each package, edited in place on every push.
- Read Dependabot's commit message, GitHub's dependency-graph diff, or the markers from the Renovate preset `github>whatsnew-fyi/upgrade-notes-action`.
- `breaking`, `security`, `cves`, `dependencies`, `answered` and `json` outputs, and `fail-on` to fail the step on breaking changes or security fixes.
- `exclude` globs and `record-misses` to control what leaves the repository.
