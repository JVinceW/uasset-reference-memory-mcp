# US-003 SQLite graph-store schema + atomic write path

## Status

implemented

## Lane

normal

## Product Contract

Persist nodes (US-001), edges and unresolved refs (US-002) into the SQLite
artifact at `.asset-memory/index.db` using the exact schema in
`asset-graph-model.md`, with `index_meta` bookkeeping and an atomic build (temp
DB / transaction, swap on success) so an interrupted run never corrupts a prior
good index.

## Relevant Product Docs

- `docs/product/asset-graph-model.md` (all four tables)
- `docs/product/indexing.md` (atomic build, incremental)
- `docs/decisions/0004-sqlite-durable-layer.md` (SQLite conventions reference)

## Acceptance Criteria

- Creates `assets`, `edges`, `unresolved_refs`, `index_meta` with the documented
  columns, primary keys, and indexes.
- `index_meta` records `schema_version`, `project_root`, `indexed_at`,
  `asset_count` at minimum.
- Build is atomic: a killed run leaves the previous `index.db` intact.
- Incremental write: only assets with changed `mtime` are re-parsed; `force`
  rebuilds.
- The written file is openable by a plain SQLite driver with no custom
  extensions (reusability requirement — goal #5).
- Node driver decision (`better-sqlite3` vs `node:sqlite`) recorded in a decision
  note.

## Design Notes

- Commands: `write(nodes, edges, unresolved, meta)`; `openOrCreate(path)`
- Queries: read helpers land in E02, but schema + indexes ship here
- API: the store is the boundary between indexer and MCP tools
- Tables: all four
- Domain rules: schema is a public contract; bump `schema_version` on any change
- UI surfaces: none

## Validation

`scripts/bin/harness-cli story update --id US-003 --unit 1 --integration 1 --e2e 0 --platform 0`

| Layer | Expected proof |
| --- | --- |
| Unit | Schema created matches contract; atomic-swap survives simulated interruption; incremental skip by mtime |
| Integration | Full fixture project indexed → row counts match; file opens in a bare sqlite CLI |
| E2E | n/a |
| Platform | n/a |
| Release | Part of full suite |

## Harness Delta

May add a decision record for the Node SQLite driver choice.

## Evidence

- `npm test` — 62 tests pass (7 files). New: `store/schema`, `store/graph-store`
  (schema/upsert/edges/unresolved/meta/mtime-map), `indexer/index-project`
  (fresh, incremental add/update/remove/unchanged, force, atomic-swap-on-failure),
  `cli/parse-args`.
- `npm run typecheck` clean; `npm run build` produces `dist/`.
- **End-to-end on a fixture Unity project** via the built CLI
  (`node dist/cli/main.js index <root>`): 9 nodes with correct types/origins,
  3 expected warnings, incremental re-run reported `+0 ~0 -0 =9`.
- **Reusability proven**: the output `.asset-memory/index.db` was queried with a
  bare `sqlite3` CLI (no custom extensions) — `index_meta` holds
  `schema_version=1`, `project_root`, `indexed_at`, `asset_count`.
- Driver decision recorded: `docs/decisions/0008-node-sqlite-driver.md`
  (better-sqlite3; `node:sqlite` is the documented fallback, isolated behind
  `src/store/graph-store.ts`).

### Notes / boundaries

- `edges`/`unresolved_refs` tables and write paths exist and are unit-tested, but
  are populated by the ref-extractor in **US-002** (edges=0 until then).
- Atomicity: build into `<db>.building-<pid>`, checkpoint-truncate, then
  `rename` swap; a failing scan leaves the prior index intact (tested).
