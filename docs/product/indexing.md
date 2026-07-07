# Indexing Behavior

Indexing is a static, offline pass over the Unity project files. Two components
feed the graph store:

1. **`meta-scanner`** — walks the project, reads every `.meta`, builds the
   `GUID → {path, name, asset_type, origin, package_id}` map, and emits asset
   nodes. `asset_type` derives from extension + importer type in the `.meta`.
2. **`ref-extractor`** — scans each text-serialized asset for `guid:` references,
   capturing the surrounding `fileID` and the YAML property name as `context`,
   and emits edges. GUIDs that resolve to no known node become `unresolved_refs`.

## Scan Scope

| Location | Scanned | `origin` | Notes |
| --- | --- | --- | --- |
| `Assets/` | nodes + outgoing edges | `project` | The user's own assets |
| `Packages/` | nodes + outgoing edges | `package` | Embedded/local packages |
| `Library/PackageCache/` | nodes + outgoing edges | `package` | Registry packages |
| Built-in GUIDs | pre-seeded synthetic nodes | `builtin` | Never unresolved |

Package identity keys on **GUID** (stable). PackageCache paths carry version
suffixes and are regenerated, so path is informational for packages.
`package_id` records e.g. `com.unity.render-pipelines.universal@14.0.8`.

## Query Behavior Rules (enforced by the tools that consume this index)

- `find_unused_assets` reports **only `origin='project'`** assets. An "unused"
  package asset is meaningless noise.
- Traversal tools (`find_references`, `get_dependencies`, `trace_path`) cross all
  origins, so "what breaks if this package updates?" works.
- `search_assets` / `get_overview` accept an `origin` filter; overview includes a
  per-package inbound-reference summary. A package with zero inbound edges from
  `origin='project'` assets is a removal candidate.
- `index_status` flags when `Packages/packages-lock.json` is newer than the
  index (package versions may have shifted).

## Incremental Re-Index

Default `index_project` is incremental: re-parse only files whose `mtime` differs
from the stored value. `force: true` rebuilds from scratch.

## Error Handling

Indexing is best-effort, never all-or-nothing.

- **Unparseable YAML** → record the node (its `.meta` still parses), skip edge
  extraction, add to the warnings list returned by `index_project` and shown in
  `index_status`.
- **Binary serialization detected** (expected-text file lacks the `%YAML`
  header) → fail loudly: "this project uses binary serialization; switch Asset
  Serialization to Force Text." Do not produce a silently-empty graph.
- **Missing `.meta` / orphan `.meta`** → warnings list (project hygiene signal).
- **Unresolvable GUID refs** → `unresolved_refs` table; never an error.
- **Stale index** → queries answer from what is indexed; `index_status` reports
  staleness. Inform, never auto-reindex (manual-trigger philosophy).
- **Interrupted indexing** → build into a temp DB / transaction and atomically
  swap on success; a killed run never corrupts the previous good index.
