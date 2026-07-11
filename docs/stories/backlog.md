# Story Backlog

Populated from the 2026-07-07 asset-memory MCP design intake. The current
product contract lives in `docs/product/`.

## Implemented Epics

| Epic | Description | Status |
| --- | --- | --- |
| E01 | Static index core: scan, GUID map, nodes, edges, packages, SQLite store | implemented |
| E02a | Shared query layer: traversal, unused assets, trace, search, overview | implemented |
| E02b | MCP server: query-tool wrapper and schemas | implemented |
| E03 | Verification: Unity exporter plus `verify_index` diff | implemented |
| E04 | Local web graph viewer: Node server and static WASM flavors | implemented |

## Story Packets

| Story | Title | Lane | Status |
| --- | --- | --- |
| US-001 | Project scan, GUID map, and asset nodes | normal | implemented |
| US-002 | Reference extraction, edges, and unresolved references | normal | implemented |
| US-003 | SQLite graph store and atomic write path | normal | implemented |
| US-004 | Package origin and builtin GUID seeding | normal | implemented |
| US-005 | Graph traversal: dependencies and references | normal | implemented |
| US-006 | Unused assets | normal | implemented |
| US-007 | Shortest dependency path | normal | implemented |
| US-008 | Asset search and graph overview | normal | implemented |
| US-009 | Viewer server flavor | normal | implemented |
| US-010 | Static WASM viewer flavor | normal | implemented |
| US-011 | MCP server | normal | implemented |
| US-012 | Scanner refinements | tiny | implemented |
| US-013 | Addressables parser | normal | implemented |
| US-014 | Project configuration | normal | implemented |
| US-015 | Addressable roots option | normal | implemented |
| US-016 | Configurable scanner ignore rules | normal | implemented |
| US-017 | Open-source packaging | normal | implemented |
| US-018 | Shared snapshot | normal | implemented |
| US-019 | Raw edge query | normal | implemented |
| US-020 | JSON graph export | normal | implemented |
| US-021 | ADR management | normal | implemented |
| US-022 | CI/CD | normal | implemented |
| US-023 | Unity exporter and GUID-pair index verification | normal | implemented |

## Next Work

No selected product epic remains. Add new candidates here only after a fresh
feature intake creates a current product contract and story packet.
