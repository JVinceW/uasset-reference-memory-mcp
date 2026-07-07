# Asset Memory MCP — Design Spec

**Date:** 2026-07-07
**Status:** Approved design, pre-implementation
**Inspired by:** [DeusData/codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) — same pattern (index → SQLite graph → MCP query tools), adapted for Unity assets instead of source code.

## 1. Purpose & Goals

Build an MCP server that indexes a Unity project's assets into a persistent reference graph, so that humans and AI agents can answer structural questions about the project instantly.

Goals, in priority order:

1. **Impact analysis** — before changing/deleting an asset, know everything that references it.
2. **Find unused assets** — detect orphans nothing references, to clean up and shrink builds.
3. **AI agent context** — agents query the asset graph via MCP tools.
4. **Explore/understand** — trace dependency chains, get an architectural overview.
5. **Reusable index artifact** — the index is a plain, documented SQLite file that future external tooling can consume directly, independent of the MCP server.

Non-goals for v1:

- No background watcher / auto-indexing. **Indexing is manual-trigger only.**
- No code-based reference extraction (`Resources.Load("...")`, Addressables string addresses). Deferred; the schema reserves room for it.
- No GameObject-level (sub-asset) edge granularity — edges are asset-to-asset. The `file_id` column reserves the upgrade path.
- No Cypher/graph query language. Plain SQL over documented tables; curated MCP tools on top.

## 2. Why this is feasible

Unity's serialized assets state their references explicitly. Every asset has a `.meta` file with a stable **GUID**; text-serialized assets (`.prefab`, `.unity`, `.mat`, `.asset`, …) reference each other as `{fileID: ..., guid: ..., type: ...}`. Unlike source code (where the reference project needs tree-sitter ASTs and LSP-style type resolution to *infer* call edges), Unity hands us an unambiguous reference graph for free. We parse YAML and `.meta` files; no AST, no type resolution.

**Requirement:** the Unity project must use text serialization (Asset Serialization: Force Text). The indexer detects binary serialization and fails loudly with guidance.

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Unity Project (Assets/**, Packages/**, Library/PackageCache)│
└───────────────┬──────────────────────────┬──────────────────┘
                │ (static, offline)         │ (on-demand, manual)
        ┌───────▼────────┐          ┌───────▼──────────────┐
        │  TS Indexer    │          │  Unity Verify Tool   │
        │  meta-scanner  │          │  (C# Editor script)  │
        │  ref-extractor │          │  AssetDatabase.Get-  │
        │                │          │  Dependencies →      │
        └───────┬────────┘          │  verify.json         │
                │                   └───────┬──────────────┘
                ▼                            ▼
        ┌────────────────────────────────────────────┐
        │  SQLite index (.asset-memory/index.db)      │  ← reusable artifact
        └───────────────────┬────────────────────────┘
                            │
                    ┌───────▼────────┐
                    │  MCP Server    │  ← Claude / agents
                    │  (9 tools)     │
                    └────────────────┘
```

**Stack:** TypeScript/Node for indexer + MCP server (official MCP TS SDK). C# only for the Unity-side verify exporter. SQLite via a standard Node driver (e.g. `better-sqlite3`).

### Components

1. **`meta-scanner`** — walks the project, reads every `.meta`, builds the `GUID → {path, assetType, origin}` map. Derives `asset_type` from extension + importer type in the meta.
2. **`ref-extractor`** — scans each text-serialized asset for `guid:` references (capturing surrounding `fileID` and the YAML property name as `context`), emits edges.
3. **`graph-store`** — SQLite schema, write path, and query API (impact, unused, trace, overview).
4. **`mcp-server`** — thin MCP layer exposing the tools below, including `verify_index` which ingests `verify.json` from the Unity side.
5. **`unity-verify` (C#)** — a standalone Editor script (menu item / method, manually triggered). For each asset path it exports `AssetDatabase.GetDependencies(path, recursive: false)` to `verify.json`.

Each component has one purpose and is independently testable; the store's schema is the public contract between all of them and future external tools.

## 4. Data Model (SQLite)

Artifact: `.asset-memory/index.db` in the Unity project root.

### 4.1 `assets` (nodes)

```sql
CREATE TABLE assets (
  guid        TEXT PRIMARY KEY,   -- Unity GUID from the .meta
  path        TEXT NOT NULL,      -- 'Assets/Prefabs/Player.prefab'
  name        TEXT NOT NULL,      -- basename, for fast search
  asset_type  TEXT NOT NULL,      -- 'Prefab'|'Scene'|'Material'|'Texture'|'Script'
                                  -- |'Shader'|'AnimationClip'|'AnimatorController'
                                  -- |'ScriptableObject'|'Sprite'|'AudioClip'|'Font'
                                  -- |'Model'|'Folder'|'Other'
  origin      TEXT NOT NULL,      -- 'project' (Assets/) | 'package' | 'builtin'
  package_id  TEXT,               -- e.g. 'com.unity.render-pipelines.universal@14.0.8'
  file_size   INTEGER,            -- bytes
  mtime       INTEGER,            -- for incremental re-index
  is_binary   INTEGER NOT NULL    -- 1 = cannot be scanned for outgoing refs
);
CREATE INDEX idx_assets_name ON assets(name);
CREATE INDEX idx_assets_type ON assets(asset_type);
CREATE INDEX idx_assets_path ON assets(path);
```

Folders get nodes (cheap; enables path-scoped queries). Built-in Unity assets (sentinel GUIDs such as `0000000000000000f000000000000000`) are pre-seeded as synthetic `origin='builtin'` nodes so references to them resolve.

### 4.2 `edges` (references)

```sql
CREATE TABLE edges (
  from_guid  TEXT NOT NULL,       -- asset whose file contains the reference
  to_guid    TEXT NOT NULL,       -- referenced asset
  ref_kind   TEXT NOT NULL,       -- see below
  file_id    TEXT,                -- Unity fileID at the ref site (future sub-asset use)
  context    TEXT,                -- YAML property name: 'm_Materials', 'm_Script', '_MainTex'
  count      INTEGER DEFAULT 1,   -- duplicate refs collapse into one row
  PRIMARY KEY (from_guid, to_guid, ref_kind, context)
);
CREATE INDEX idx_edges_to   ON edges(to_guid);
CREATE INDEX idx_edges_from ON edges(from_guid);
```

`ref_kind` v1 values: `USES_SCRIPT`, `USES_MATERIAL`, `USES_TEXTURE`, `USES_SHADER`, `USES_MESH`, `USES_ANIMATION`, `NESTED_PREFAB`, `SERIALIZED_REF` (generic catch-all). Typed by target asset type / property context. Extensible later with `CODE_REF`, `ADDRESSABLE_REF` without schema change.

### 4.3 `unresolved_refs` (broken-reference detector)

```sql
CREATE TABLE unresolved_refs (
  from_guid TEXT NOT NULL,
  to_guid   TEXT NOT NULL,   -- GUID resolving to nothing: not project, package, or builtin
  context   TEXT
);
```

A GUID that resolves nowhere is a genuinely broken reference (deleted asset or missing package). Free QA output of indexing.

### 4.4 `index_meta` (bookkeeping)

```sql
CREATE TABLE index_meta (
  key   TEXT PRIMARY KEY,  -- 'schema_version', 'project_root', 'indexed_at',
  value TEXT               -- 'unity_version', 'asset_count', 'verify_last_run', ...
);
```

`schema_version` is mandatory — external tools depend on knowing what they're reading.

## 5. Scan Scope & Package Handling

- **`Assets/`** — full scan: nodes + outgoing edges. `origin='project'`.
- **`Packages/`** (embedded/local) **and `Library/PackageCache/`** (registry) — full scan. `origin='package'`, `package_id` recorded. Package identity keys on GUID; PackageCache paths are informational (they carry version suffixes and get regenerated).
- **Built-in GUIDs** — pre-seeded synthetic nodes; never unresolved.

Query behavior rules:

- `find_unused_assets` reports **only `origin='project'`** assets.
- Traversal tools (`find_references`, `get_dependencies`, `trace_path`) cross all origins.
- `search_assets` and `get_overview` accept an `origin` filter; overview includes a per-package inbound-reference summary (which packages the project actually uses — zero-inbound packages are removal candidates).
- `index_status` flags when `Packages/packages-lock.json` is newer than the index (package versions may have shifted).

## 6. MCP Tool Set (9 tools)

### Indexing
| Tool | Behavior |
|---|---|
| `index_project(path, force?)` | Full scan → build DB. Default incremental: re-parse only files with changed `mtime`. `force: true` rebuilds. Manual trigger only. Returns counts + warnings. |
| `index_status()` | Asset/edge counts, last-indexed time, unresolved-ref count, warnings, staleness hints (files or lockfile newer than index). |

### Core queries
| Tool | Behavior |
|---|---|
| `find_references(asset, depth?)` | Impact analysis: who references this asset, direct or transitive up to `depth`. `asset` accepts path, GUID, or name. Returns referrer chains with `context`. |
| `get_dependencies(asset, depth?)` | Forward: everything this asset pulls in. `depth: -1` = full closure. |
| `find_unused_assets(scope?, roots?)` | Assets unreachable from roots. Default roots: scenes + `Resources/` + their closures. `scope` narrows to a folder. Sorted by `file_size` descending. Project-origin only. |
| `trace_path(from, to)` | Shortest reference chain between two assets. |

### Exploration
| Tool | Behavior |
|---|---|
| `search_assets(name?, type?, path_prefix?, origin?, min_refs?, max_refs?)` | Structured search over nodes with inbound/outbound ref-count filters. |
| `get_overview()` | Counts by type/origin, top dependency hubs (most-referenced), broken-ref summary, per-package usage, biggest folders. |

### Verification
| Tool | Behavior |
|---|---|
| `verify_index(verify_json_path)` | Diffs Unity's `AssetDatabase.GetDependencies` export against the graph. Reports edges Unity sees that we miss, edges we have that Unity doesn't, per-category counts. The accuracy meter for the static parser. |

No raw-SQL MCP tool in v1; external tools open the SQLite file directly. A read-only `query_sql` tool may be added later if the curated set proves limiting.

### Unity verify contract (`verify.json`)

```json
{
  "unityVersion": "2022.3.x",
  "exportedAt": "<iso8601>",
  "assets": [
    { "path": "Assets/Prefabs/Player.prefab",
      "guid": "8f2a1c...",
      "dependencies": ["Assets/Materials/body.mat", "..."] }
  ]
}
```

Produced by a manually-triggered C# Editor menu item using `AssetDatabase.GetDependencies(path, recursive: false)` over all assets.

## 7. Error Handling

Indexing is best-effort, never all-or-nothing:

- **Unparseable YAML** → record the node (its `.meta` still parses), skip edges, add to a warnings list returned by `index_project` and shown in `index_status`.
- **Binary serialization detected** (file lacks `%YAML` header where text expected) → fail loudly: "this project uses binary serialization; switch Asset Serialization to Force Text."
- **Missing `.meta` / orphan `.meta`** → warnings list (project hygiene signal).
- **Unresolvable GUID refs** → `unresolved_refs` table; never an error.
- **Stale index** → queries answer from what's indexed; `index_status` reports staleness. Inform, never auto-reindex.
- **Interrupted indexing** → build into a temp DB / transaction, atomic swap on success; a killed index run never corrupts the previous good index.

## 8. Testing

- **Unit tests** (bulk of correctness): parser fixtures — hand-crafted `.meta`, `.prefab`, `.mat`, `.unity` snippets covering every `ref_kind`, built-in GUIDs, unresolved refs, malformed YAML, binary-header detection.
- **Integration test**: a small committed fixture Unity project (~20 assets: scene → prefab → material → texture/shader chain, ScriptableObject, package-style folder, one deliberately broken ref, one orphan). Assert exact node/edge counts and specific query results (`find_references` on the texture, `find_unused_assets` finds the orphan, `trace_path` scene → texture).
- **Ground truth**: `verify_index` against a real Unity project is the ongoing accuracy/regression harness for the parser.
- **MCP layer**: a few end-to-end tool-call tests against the fixture index.

## 9. Future extensions (explicitly out of v1)

- `CODE_REF` edges from `Resources.Load` / Addressables string scanning (path lookup, not type inference).
- Addressables settings parsing (`ADDRESSABLE_REF`, address → GUID map).
- Sub-asset (GameObject/fileID-level) edge granularity.
- Read-only `query_sql` MCP tool.
- Graph visualization on top of the SQLite artifact.
