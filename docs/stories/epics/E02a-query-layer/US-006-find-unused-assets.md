# US-006 find_unused_assets (roots reachability, project-origin, scope)

## Status

implemented

## Lane

normal

## Product Contract

Report project-origin assets not reachable from any root entry point. Roots
default to all Scenes plus everything under a `Resources/` folder; a caller may
pass explicit roots. Folders are always excluded; Scripts are excluded by default
(code references are not in the graph). Results are scoped by an optional path
prefix and sorted by file size descending.

## Relevant Product Docs

- `docs/product/mcp-tools.md` (`find_unused_assets`)
- `docs/product/indexing.md` (project-origin rule)

## Acceptance Criteria

- Reachability computed via forward closure from roots (recursive CTE).
- Only `origin='project'` assets reported; package/builtin excluded.
- Folders excluded; Scripts excluded unless `includeScripts`.
- `scope` narrows to a path prefix; `roots` overrides default entry points.
- Sorted by `file_size` desc (nulls last), then path.

## Design Notes

- Queries: `findUnusedAssets(store, { scope?, roots?, includeScripts? })`
- API: `src/query/unused.ts` over `GraphStore`
- Tables: `assets`, `edges` (recursive CTE)
- Domain rules: unused never includes non-project assets

## Validation

`scripts/bin/harness-cli story update --id US-006 --unit 1 --integration 0 --e2e 1 --platform 0`

| Layer | Expected proof |
| --- | --- |
| Unit | Orphans-only; origin/folder/script exclusion; size sort; scope; includeScripts |
| Integration | (covered by unit fixture store) |
| E2E | Spot-check on `pudgy-index.db` scoped to user modules |
| Platform | n/a |
| Release | Part of full suite |

## Evidence

- `npm test` — `query/unused` (4 tests) pass within the full suite.
- **Real-data spot-check** (`pudgy-index.db`): `Assets/lobby.contents/` → 710
  candidates (~72 MB, biggest textures first); `Assets/pengu.contents/` → 131
  (~5.3 MB). Directionally correct.

### IMPORTANT limitation (logged: backlog)

Roots are only Scenes + `Resources/`. This project uses **Addressables**
heavily, and Addressable entries / `Resources.Load`/address string loads are not
yet counted as roots. So results **over-report** — Addressable-loaded assets can
appear "unused". Treat output as *candidates*, not a delete list, until
Addressables + code-ref roots land (backlog item; relates to deferred `CODE_REF`
/ `ADDRESSABLE_REF`).
