# Commands

Everything runs from the repository root with Node 24.

## Finishing checks

A change is finished when all of these pass. CI runs them in
`.github/workflows/ci.yml`.

```sh
npm run lint          # Biome; warnings fail
npm run typecheck     # tsc --noEmit
npm test              # Vitest
npm run check-dist    # rebuilds dist/ and fails if it differs from the commit
python3 scripts/adr.py index --check
npx -y declarative-changelog@0.2.1 validate CHANGELOG.md --require-level 2 --max-warnings 0
```

**Commit `dist/` with the source change.** The runner executes
`dist/index.mjs` from the tagged tree, so a source change without a rebuilt
bundle ships nothing, and `check-dist` fails the PR. `npm run build` writes it.

## Trying it against What's New

`api-url` points the Action at another origin, which is how a change in
whatsnew-app's renderer is tried before it deploys:

```sh
curl -s -X POST 'https://whatsnew.fyi/api/v1/upgrade-notes?render=markdown' \
  -H 'content-type: application/json' \
  --data '{"dependencies":[{"name":"next","from":"15.5.0","to":"16.0.0"}]}' \
  | jq -r .rendered.markdown
```

## Releasing

1. Move the `[Unreleased]` notes in `CHANGELOG.md` under the new version.
2. Bump `version` in `package.json`, run `npm run build`, commit.
3. Tag `vX.Y.Z`, push the tag, and move the major tag (`v1`) to it.
4. Publish the GitHub release; tick "Publish this Action to the GitHub
   Marketplace".
