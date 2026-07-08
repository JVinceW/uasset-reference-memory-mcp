# US-019 get_edges: raw per-edge inspection (query + MCP tool + web API)

## Status

implemented

## Lane

normal (intake #9 — surfaced during real MCP testing on pudgy)

## Product Contract

Expose the individual reference edges (each `ref_kind`, YAML `context`, `fileId`,
`count`) between/for assets — the raw rows behind the aggregated
`find_references`/`get_dependencies` views. Answers "list the exact reference
sites" without grepping the asset source.

## Relevant Product Docs

- `docs/product/mcp-tools.md`
- `docs/product/asset-graph-model.md` (edges)

## Acceptance Criteria

- `getEdges(db, { from?, to?, kind?, limit? })` returns
  `{ from, to, refKind, context, fileId, count }[]`, resolving from/to refs to
  guids; requires at least one endpoint; unresolvable endpoint → `[]`.
- MCP tool `get_edges` and web `/api/edges` expose it.

## Design Notes

- `src/query/edges.ts` — `getEdges`
- `src/mcp/tools.ts` + `src/mcp/server.ts` — `get_edges` tool
- `src/web/api.ts` — `/api/edges`

## Validation

`scripts/bin/harness-cli story update --id US-019 --unit 1 --integration 0 --e2e 1 --platform 0`

| Layer | Expected proof |
| --- | --- |
| Unit | between/from/to/kind filters; unresolved endpoint |
| E2E | Real pudgy Map -> Decoration edge dump |

## Evidence

- `npm test` — 170 tests pass (incl. `query/edges` 5).
- **Real project**: `get_edges(P_pengu_map_1 -> P_pengu_decoration_1)` returned
  the 5 distinct reference sites (`m_SourcePrefab`, `m_CorrespondingSourceObject`,
  `m_RemovedGameObjects`, `m_Modifications`, `objectReference` with count=111) —
  exactly what previously required grepping the prefab source.
