# MCP Tool Contract

Nine tools. Naming mirrors `codebase-memory-mcp` so it feels familiar.

## Indexing

| Tool | Behavior |
| --- | --- |
| `index_project(path, force?)` | Full scan → build DB. Default incremental (re-parse only changed `mtime`); `force: true` rebuilds. Manual trigger only. Returns counts + warnings. |
| `index_status()` | Asset/edge counts, last-indexed time, unresolved-ref count, warnings, staleness hints (files or `packages-lock.json` newer than index). |

## Core Queries

| Tool | Behavior |
| --- | --- |
| `find_references(asset, depth?)` | **Impact analysis.** Who references this asset — direct or transitive up to `depth`. `asset` accepts path, GUID, or name. Returns referrer chains with `context` (why). |
| `get_dependencies(asset, depth?)` | Forward: everything this asset pulls in. `depth: -1` = full closure. |
| `find_unused_assets(scope?, roots?)` | Orphans unreachable from roots. Default roots: scenes + `Resources/` + their closures. `scope` narrows to a folder. **Project-origin only.** Sorted by `file_size` descending. |
| `trace_path(from, to)` | Shortest reference chain between two assets. |

## Exploration

| Tool | Behavior |
| --- | --- |
| `search_assets(name?, type?, path_prefix?, origin?, min_refs?, max_refs?)` | Structured node search with inbound/outbound ref-count filters. |
| `get_overview()` | Counts by type/origin, top dependency hubs (most-referenced), broken-ref summary, per-package usage, biggest folders. |

## Verification

| Tool | Behavior |
| --- | --- |
| `verify_index(verify_json_path)` | Diffs Unity's `AssetDatabase.GetDependencies` export against the graph. Reports edges Unity sees that we miss, edges we have that Unity does not, per-category counts. The static parser's accuracy meter. See `docs/product/verification.md`. |

## Deliberately excluded (v1)

No raw-SQL MCP tool. External tools get full power by opening the SQLite file
directly; agents get the curated tools above. A read-only `query_sql` tool may be
added later if the curated set proves limiting.
