# US-008 search_assets + get_overview

## Status

implemented

## Lane

normal

## Product Contract

`search_assets` — structured node search by name substring, asset type, path
prefix, origin, and inbound reference-count bounds. `get_overview` — architecture
summary: counts by type and origin, edge/unresolved totals, distinct broken-ref
guids, and top dependency hubs (most-referenced assets).

## Relevant Product Docs

- `docs/product/mcp-tools.md` (`search_assets`, `get_overview`)

## Acceptance Criteria

- `searchAssets` filters combine (AND); inbound count via edges; ordered by path,
  limited (default 500).
- `getOverview` returns totals, `byType`, `byOrigin`, `edgeCount`,
  `unresolvedCount`, `brokenRefGuids`, and `topReferenced` (desc).

## Design Notes

- Queries: `searchAssets(store, filters)`, `getOverview(store)` in
  `src/query/search.ts`
- Tables: `assets`, `edges`, `unresolved_refs`

## Validation

`scripts/bin/harness-cli story update --id US-008 --unit 1 --integration 0 --e2e 1 --platform 0`

| Layer | Expected proof |
| --- | --- |
| Unit | filter combinations; ref-count filter; overview counts/hubs |
| E2E | Spot-check on `pudgy-index.db` |
| Release | Part of full suite |

## Evidence

- `npm test` — `query/search` (3 tests) pass in the full suite (105 total).
- **Real-data spot-check** (`pudgy-index.db`): total 22,913 / edges 12,956 /
  unresolved 8,119 / brokenGuids 583; top hubs = builtin resources (371×, 274×)
  and ubiquitous UI scripts (`Image.cs` 329×) — validates builtin resolution and
  hub detection end-to-end.
