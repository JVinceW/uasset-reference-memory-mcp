# MCP Tool Contract

Twelve tools. Naming mirrors `codebase-memory-mcp` so it feels familiar.

## Indexing

| Tool | Behavior |
| --- | --- |
| `index_project(path, force?)` | Full scan and DB build. Default incremental mode re-parses only changed files. |
| `index_status()` | Index location, counts, and last-indexed time. |

## Core Queries

| Tool | Behavior |
| --- | --- |
| `find_references(asset, depth?)` | Impact analysis: direct or transitive referrers. |
| `get_edges(from?, to?, kind?, limit?)` | Raw reference-site rows with kind, context, file ID, and count. |
| `get_dependencies(asset, depth?)` | Forward dependencies. `depth: -1` is full closure. |
| `find_unused_assets(scope?, roots?)` | Project-origin assets unreachable from configured roots. |
| `trace_path(from, to)` | Shortest reference chain. |

## Exploration

| Tool | Behavior |
| --- | --- |
| `search_assets(name?, type?, pathPrefix?, origin?, minRefs?, maxRefs?)` | Structured node search and reference-count filters. |
| `get_overview()` | Counts, hubs, broken references, package usage, and largest folders. |
| `export_graph_json(out?)` | Writes a stable, git-diffable JSON export of the graph. |
| `manage_adr(action, ...)` | Manages Markdown ADRs under `.asset-memory/adrs/`. |

## Verification

| Tool | Behavior |
| --- | --- |
| `verify_index(verifyJsonPath)` | Compares a Unity `verify.json` export with the graph. Returns totals, full category counts, at most ten missed and extra samples, and the full on-disk `verify-report.json` path. See `docs/product/verification.md`. |

## Deliberately Excluded

There is no raw-SQL MCP tool in v1. External tools can open the SQLite file
directly; agents receive the curated graph surface.
