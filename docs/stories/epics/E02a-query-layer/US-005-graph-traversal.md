# US-005 Graph traversal: resolve ref + get_dependencies + find_references

## Status

planned

## Lane

normal

## Product Contract

Provide the shared read-query foundation over `index.db`: resolve an asset
reference (guid | path | name) to a node, then traverse the graph forward
(`get_dependencies` — what this asset pulls in) and backward (`find_references` —
what points at this asset), bounded by depth. Returns a subgraph (nodes + edges,
each node annotated with BFS distance) so the same result drives both the MCP
tools and the web viewer.

## Relevant Product Docs

- `docs/product/mcp-tools.md` (`find_references`, `get_dependencies`)
- `docs/product/graph-viewer.md` (subgraph shape for rendering)
- `docs/product/asset-graph-model.md` (edges indexes)

## Acceptance Criteria

- `resolveRef(store, ref)` resolves an exact guid, else exact path, else unique
  name; ambiguous name or no match returns a clear result (null + reason).
- `getDependencies(store, ref, depth)` returns the forward subgraph: nodes
  reachable via `from→to` edges up to `depth` (`-1` = full closure), plus the
  connecting edges; the root node is distance 0.
- `findReferences(store, ref, depth)` returns the backward subgraph via
  `to→from` edges (impact analysis).
- Cycles terminate (visited set); depth bounds respected.
- Subgraph nodes carry `distance`; result is stable/among-ordered for testing.
- Works on the real `pudgy-index.db` (spot-checked) without loading the whole
  graph.

## Design Notes

- Commands: none (read-only)
- Queries: `resolveRef`, `getDependencies`, `findReferences`
- API: pure functions over `GraphStore` in `src/query/`; return
  `{ root, nodes: (AssetNode & {distance})[], edges: Edge[] }`
- Tables: `assets`, `edges` (uses `idx_edges_from` / `idx_edges_to`)
- Domain rules: traversal crosses all origins; builtins/unresolved handled
- UI surfaces: consumed by E04 viewer and E02b MCP server

## Validation

`scripts/bin/harness-cli story update --id US-005 --unit 1 --integration 1 --e2e 0 --platform 0`

| Layer | Expected proof |
| --- | --- |
| Unit | resolveRef precedence; forward/backward BFS depth + cycle termination on a built fixture store |
| Integration | Build a small index via indexProject, assert dependency/dependent subgraphs |
| E2E | Spot-check against real `pudgy-index.db` |
| Platform | n/a |
| Release | Part of full suite |

## Harness Delta

Establishes `src/query/` as the shared layer reused by viewer and MCP server.

## Evidence

Add after implementation.
