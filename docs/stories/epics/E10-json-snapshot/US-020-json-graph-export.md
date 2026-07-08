# US-020 JSON graph snapshot export (graph.json)

## Status

implemented

## Lane

normal (E10, intake — spec slice)

## Product Contract

A stable, git-diffable JSON export of the whole graph (`graph.json`): `meta`,
`assets`, `edges` (readable paths), `unresolved`, `addressables`. Complements the
compact binary snapshot (`index.db.br`). Exposed via CLI `export-json` and MCP
`export_graph_json`.

## Acceptance Criteria

- `exportGraphJson(db)` returns `{ meta, assets, edges, unresolved, addressables }`
  with deterministic ordering (assets by path; edges by from/to/kind/context).
- `writeGraphJson(db, out)` writes pretty JSON.
- CLI `export-json [project] [--db] [--out]`; MCP `export_graph_json(out?)`
  writes the file and returns path + meta.

## Design Notes

- `src/snapshot/json-export.ts`
- `src/cli/{parse-args,main}.ts` — `export-json` + `--out`
- `src/mcp/{tools,server}.ts` — `export_graph_json`

## Validation

`scripts/bin/harness-cli story update --id US-020 --unit 1 --integration 0 --e2e 1 --platform 0`

| Layer | Expected proof |
| --- | --- |
| Unit | meta counts; sorted assets/edges; unresolved/addressables; determinism |
| E2E | Real project export-json |

## Evidence

- `npm test` — 175 tests pass (incl. `json-export` 5).
- **Real project**: `export-json` on `pudgy-index.db` wrote `graph.json` with
  20,168 assets / 7,990 edges / 6,714 unresolved / 2,916 addressables (11 MB
  pretty-printed), keys `meta, assets, edges, unresolved, addressables`.

### Note

- Pretty JSON is large (~11 MB at 20k assets); acceptable for diffability. A
  compact/scoped mode is a possible later refinement.
