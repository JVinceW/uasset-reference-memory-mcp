# US-007 trace_path (shortest reference chain)

## Status

implemented

## Lane

normal

## Product Contract

Given two assets, return the shortest forward reference chain from the first to
the second (how asset A ends up depending on asset B), or null when no path
exists or a ref is unresolved.

## Relevant Product Docs

- `docs/product/mcp-tools.md` (`trace_path`)

## Acceptance Criteria

- BFS shortest path over forward edges; returns ordered `{ nodes, edges }`.
- `from === to` yields a trivial single-node path with no edges.
- Unresolved ref or no forward path returns null.

## Design Notes

- Queries: `tracePath(store, fromRef, toRef)` in `src/query/trace.ts`
- Tables: `assets`, `edges` (outgoingEdges)

## Validation

`scripts/bin/harness-cli story update --id US-007 --unit 1 --integration 0 --e2e 0 --platform 0`

| Layer | Expected proof |
| --- | --- |
| Unit | chain, shortest-of-many, trivial, null cases |
| Release | Part of full suite |

## Evidence

- `npm test` — `query/trace` (4 tests) pass in the full suite (105 total).
- Shortest-path verified (A→D→E chosen over A→B→C→E).
