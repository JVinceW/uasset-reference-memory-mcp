# Story Backlog

Populated from spec intake (2026-07-07). Design spec:
`docs/superpowers/specs/2026-07-07-asset-memory-mcp-design.md`. Intake map:
`docs/product/spec-intake.md`.

Story packets are created when work is selected. E01 is sliced; E02/E03 remain
candidate epics until selected.

## Candidate Epics

| Epic | Description | Status |
| --- | --- | --- |
| E01 | Static index core: scan, GUID map, asset nodes, edges, packages, SQLite store | done |
| E02a | Shared query layer: find_references, get_dependencies, find_unused, trace_path, search, overview (store methods over index.db) | sliced |
| E04 | Local web graph viewer: neighborhood explorer; server (Node) + static (WASM) flavors over one UI | unsliced |
| E02b | MCP server: wrap the query layer as MCP tools | unsliced |
| E03 | Verification: Unity C# exporter + `verify_index` diff | unsliced |

Build order (approved, intake #3): **E02a query layer → E04 viewer + E02b MCP
server (both reuse E02a)** → E03. Product doc: `docs/product/graph-viewer.md`.

## E01 Stories (done)

| Story | Title | Lane | Status |
| --- | --- | --- | --- |
| US-001 | Project scan + GUID map + asset nodes | normal | implemented |
| US-002 | Reference extraction → edges + unresolved refs | normal | implemented |
| US-003 | SQLite graph-store schema + atomic write path | normal | implemented |
| US-004 | Package/origin classification + builtin GUID seeding | normal | implemented |

## E02a Stories (sliced) — shared query layer

| Story | Title | Lane | Status |
| --- | --- | --- | --- |
| US-005 | Graph traversal: resolve ref + get_dependencies + find_references | normal | planned |
| US-006 | find_unused_assets (roots reachability, project-origin, scope) | normal | planned |
| US-007 | trace_path (shortest reference chain between two assets) | normal | planned |
| US-008 | search_assets + get_overview | normal | planned |

## E04 Story candidates (unsliced) — web viewer

- Subgraph API shape (nodes+edges with BFS distance) from the query layer
- Viewer frontend (Cytoscape render, search, expand-on-click)
- HttpProvider (Node web server serving subgraph JSON)
- WasmProvider (static viewer.html via sql.js)

## E02b Story candidates (unsliced) — MCP server

- MCP stdio server wrapping the query layer
- Tool schemas for the 9 tools; index_project/index_status wiring

## E03 Story candidates (unsliced) — verification

- Unity C# verify exporter (Editor script → verify.json)
- verify_index diff tool

## Suggested build order

E01 ✅ → **E02a query layer** → E04 viewer + E02b MCP server (both reuse E02a)
→ E03 verification.
