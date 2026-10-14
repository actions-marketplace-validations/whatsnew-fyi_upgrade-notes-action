# AGENTS.md

## Identity

You maintain **What's New upgrade notes**, a GitHub Action that comments on
dependency PRs with the vendor's own breaking changes, migration notes,
deprecations and CVE fixes, from What's New's API
(`POST https://whatsnew.fyi/api/v1/upgrade-notes?render=markdown`). It runs in
other people's repositories, often private ones, so what it sends and when it
fails a step matter more than anything it prints.

- `action.yml`: the Action's inputs and outputs, `node24`, `dist/index.mjs`.
- `src/`: TypeScript. `main.ts` is wiring only; `run.ts` decides; `sources/`
  reads the PR; `ecosystems.ts` maps a bump to the API's identity; `api.ts` is
  the one outbound call; `report.ts` builds outputs and the comment.
- `dist/`: the esbuild bundle the runner executes. Committed, never hand-edited.
- `default.json`: the Renovate preset.
- `test/`: Vitest, against the formats the sources really emit.
- `.agents/`: context for working on this repo. It is not shipped.

## Context routing

- **Before running checks, and before calling a change finished:** READ
  [`.agents/context/commands.md`](.agents/context/commands.md).
- **Before touching any file:** MATCH the task against the trigger table in
  [`.agents/rules/decisions.md`](.agents/rules/decisions.md), and READ every ADR
  a matching row names.
- **If making an architectural or scope decision:** CONSULT
  [`.agents/memory/decisions.md`](.agents/memory/decisions.md), then record the
  new one per [`.agents/rules/decisions.md`](.agents/rules/decisions.md).

## Capabilities

- RUN the checks in [`.agents/context/commands.md`](.agents/context/commands.md).
- ADD a decision with `python3 scripts/adr.py new "<title>"`, then `index`.
- WRITE to `.agents/memory/`, which is read/write by design.

## Maintenance

This file is a **router**, not a store. Durable knowledge goes in `.agents/`:
standing rules in `rules/`, decisions in `memory/decisions/`, reference in
`context/`. Add a routing line only when nothing points at the new file yet.
