# MCP Tool Contract

Fifteen tools. Naming mirrors `codebase-memory-mcp` so it feels familiar.

## Indexing

| Tool | Behavior |
| --- | --- |
| `index_project(path, force?)` | Full scan and DB build. Default incremental mode re-parses only changed files. |
| `index_status()` | Stored index location, counts, and last-indexed time. Informational only; it does not scan live assets or prove freshness. |

## Core Queries

| Tool | Behavior |
| --- | --- |
| `find_references(asset, depth?)` | Impact analysis: direct or transitive referrers. |
| `get_edges(from?, to?, kind?, limit?)` | Raw reference-site rows with kind, context, file ID, and count. |
| `get_dependencies(asset, depth?)` | Forward dependencies. `depth: -1` is full closure. |
| `find_unused_assets(scope?, includeScripts?, addressableRoots?)` | Project-origin assets unreachable from scene, Resources, and optionally Addressable roots. |
| `trace_path(from, to)` | Shortest reference chain. |

## Exploration

| Tool | Behavior |
| --- | --- |
| `search_assets(name?, type?, pathPrefix?, origin?, minRefs?, maxRefs?)` | Structured node search and reference-count filters. |
| `get_addressable_info(asset)` | Resolve one asset or Addressables address and report membership, group, labels, references, and reachability. |
| `search_addressables(query?, group?, label?, pathPrefix?, type?, reachableOnlyBecauseAddressable?, limit?)` | Filter Addressable entries with deterministic bounded results, totals, and truncation. |
| `list_addressable_groups()` | Group inventory with entry counts, distinct labels, and indexed source bytes (not bundle bytes). |
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

The full Addressables response and safety contract is documented in
[`addressables.md`](addressables.md).

## Agent Refresh Policy

- When freshness has not been established in the current task/session, call
  `index_project` once before the first graph-dependent query.
- Reuse the successful index across subsequent read-only queries while no asset
  state changes.
- After a coherent batch of asset or `.meta` changes, call incremental
  `index_project` once before further graph-dependent work.
- Use `force: true` for an explicit guaranteed-freshness request,
  timestamp-preserving synchronization, restored backups/archives, or visible
  disagreement between Unity and the incremental graph.
- Do not auto-loop on incomplete-pair warnings. Wait for Unity or source control
  to stabilize, then retry.
- Stop on `DuplicateGuidError` and require the conflicting `.meta` files to be
  repaired before retrying.

Query tools are read-only and never invoke `index_project` implicitly. There is
no background watcher. `index_status` is useful for existence, schema, counts,
and recorded time, but its stored metadata is not a live-filesystem freshness
check.
