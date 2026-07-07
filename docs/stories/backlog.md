# Story Backlog

Populated from spec intake (2026-07-07). Design spec:
`docs/superpowers/specs/2026-07-07-asset-memory-mcp-design.md`. Intake map:
`docs/product/spec-intake.md`.

Story packets are created when work is selected. E01 is sliced; E02/E03 remain
candidate epics until selected.

## Candidate Epics

| Epic | Description | Status |
| --- | --- | --- |
| E01 | Static index core: scan, GUID map, asset nodes, edges, packages, SQLite store | sliced |
| E02 | MCP query tools: index/status, impact, dependencies, unused, trace, search, overview | unsliced |
| E03 | Verification: Unity C# exporter + `verify_index` diff | unsliced |

## E01 Stories (sliced)

| Story | Title | Lane | Status |
| --- | --- | --- | --- |
| US-001 | Project scan + GUID map + asset nodes | normal | planned |
| US-002 | Reference extraction → edges + unresolved refs | normal | planned |
| US-003 | SQLite graph-store schema + atomic write path | normal | planned |
| US-004 | Package/origin classification + builtin GUID seeding | normal | planned |

## E02 Story candidates (unsliced)

- index_project + index_status
- find_references + get_dependencies (traversal)
- find_unused_assets (project-origin roots)
- trace_path
- search_assets + get_overview

## E03 Story candidates (unsliced)

- Unity C# verify exporter (Editor script → verify.json)
- verify_index diff tool

## Suggested build order

E01 (index core) → E02 (query tools) → E03 (verification). E03 depends on a
populated index and at least `find_references`/`get_dependencies` to be
meaningful.
