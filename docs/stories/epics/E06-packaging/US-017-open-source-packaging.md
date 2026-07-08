# US-017 Open-source packaging + install (npm/npx, MIT, README, LICENSE)

## Status

implemented

## Lane

normal (intake #7, maintenance)

## Product Contract

Make the tool installable as an open-source npm package `unity-asset-reference-mcp`
(Unity-only): publishable manifest, MIT license, tool README with install/usage
for all three surfaces (CLI, MCP, viewer), and working bins via `npm i -g`/`npx`.

## Acceptance Criteria

- `package.json`: name `unity-asset-reference-mcp`, not private, versioned
  (0.1.0), `license: MIT`, `files` ships `dist` + README + LICENSE,
  `prepublishOnly: npm run build`, three renamed bins.
- `LICENSE` (MIT) and a tool-focused `README.md` (harness README preserved under
  `docs/HARNESS_README.md`).
- Bins run correctly when installed and launched via npm bin symlinks.

## Design Notes

- `src/util/is-main.ts` — symlink-aware entry-point check (`realpathSync` on
  `argv[1]`); applied to cli/mcp/web entrypoints
- bins: `unity-asset-reference-mcp` (MCP), `-index` (CLI), `-web` (viewer)

## Validation

`scripts/bin/harness-cli story update --id US-017 --unit 1 --integration 0 --e2e 1 --platform 0`

| Layer | Expected proof |
| --- | --- |
| Unit | `is-main` symlink resolution (3 tests) |
| E2E | `npm pack` → install tarball into a throwaway project → run installed bin |

## Evidence

- `npm test` — 158 tests pass (incl. `is-main` 3).
- `npm pack --dry-run` — 89 files / 524 kB; ships all 3 bin entrypoints and the
  viewer assets (cytoscape + sql.js WASM), LICENSE, README.
- **Install e2e**: packed the tarball, installed into a fresh project (built
  `better-sqlite3`), and ran `unity-asset-reference-mcp-index index ./Proj` via
  the `.bin` symlink → indexed 5 assets / 1 edge.

### Bug caught by the install test

The ESM entry-point guard `import.meta.url === pathToFileURL(argv[1])` failed
when launched via an npm bin **symlink** (argv[1] = symlink path, import.meta.url
= real path) — so every installed bin exited 0 doing nothing. Fixed with
`isMainModule` (resolves `argv[1]` via `realpathSync`).

### Publishing (manual, by the maintainer)

```bash
npm login
npm publish --access public
```
Not done automatically (irreversible public action). A git remote is not yet set;
add `repository` to package.json once the GitHub repo exists.
