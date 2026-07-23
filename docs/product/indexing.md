# Indexing Behavior

Indexing is a static, offline pass over the Unity project files. Three components
feed the graph store:

1. **`meta-scanner`** — walks the project, reads every `.meta`, builds the
   `GUID → {path, name, asset_type, origin, package_id}` map, and emits asset
   nodes. `asset_type` derives from extension + importer type in the `.meta`.
2. **`ref-extractor`** — scans each text-serialized asset for `guid:` references,
   capturing the surrounding `fileID` and the YAML property name as `context`,
   and emits edges. GUIDs that resolve to no known node become `unresolved_refs`.
3. **Addressables group parser** — recognizes `AddressableAssetGroup` YAML and
   records group identity, group asset identity/path, entries, addresses,
   read-only flags, and labels. Non-group YAML produces no Addressables rows.

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
- `index_status` returns the lockfile timestamp recorded by the last successful
  index. It does not read the current lockfile or prove live project freshness.

## Incremental Re-Index

Default `index_project` is incremental: re-parse only files whose observed
modification time differs from the stored value. Each asset and its sibling
`.meta` remain one logical row; the stored effective timestamp is the newer of
the asset and `.meta` timestamps, so an ordinary change to either file is
eligible for reprocessing. Filesystem tools that preserve both timestamps can
evade this fast path. `force: true` is the
guaranteed-freshness option: it ignores the prior incremental state, reads all
graph-relevant assets, and rebuilds the generated database from current project
contents. The guarantee covers the completed scan; concurrent writes and
reported parse/read warnings can still require another run.

Incremental reconciliation is GUID-first, matching Unity's move and rename
workflow. A known GUID discovered at a new path is one updated asset: its path
and path-derived metadata are refreshed, incoming references remain attached,
and its outgoing references and Addressables group data are re-extracted. If a
path instead contains a globally new GUID while its prior GUID is absent, the
result is one removal plus one addition and a `guid-replaced` warning. This
keeps references to the absent GUID unresolved rather than silently retargeting
them.

Addressables membership is authoritative generated state. Full indexing
replaces all groups, entries, and labels. Incremental indexing replaces the
rows owned by changed group assets and removes stale membership when a group is
deleted or stops being a group. Foreign-key cascades remove dependent entries
and labels. A schema mismatch requires `index_project` to rebuild schema 3;
generated indexes are not migrated in place. A legacy schema-3 index receives a
one-time automatic fresh rebuild when its `assets` table contains uppercase
GUID identity or more than one GUID at the same asset path. The latter can
exist after a same-path replacement indexed by v0.3.0. The old database is
detected read-only and is never rewritten in place; current project files
rebuild every GUID-bearing graph and Addressables row, and the replacement is
published only after the rebuild succeeds. Its summary uses normal fresh-build
counts and does not report those compatibility changes as `guid-replaced`
assets.

## Error Handling

Indexing continues past recoverable per-file problems, but stops when a safe,
unambiguous graph cannot be published.

- **Malformed Addressables group data** → retain the node and any ordinary
  references already extracted, omit that asset's Addressables group rows, and
  add an `unreadable-asset` warning to that `index_project` run. Warnings are
  not replayed by `index_status`.
- **Project-wide ForceBinary** in `ProjectSettings/EditorSettings.asset` →
  abort the run with guidance to switch Asset Serialization to Force Text. Do
  not publish a silently empty graph.
- **Incidental non-YAML or binary content in an asset expected to contain
  YAML** → keep its node, add a `binary-serialized` warning, and skip
  outgoing-reference extraction for that asset instead of aborting the whole
  run. Known non-YAML formats such as textures, models, and audio are retained
  as nodes but are not candidates for outgoing-reference extraction.
- **Missing, orphan, or invalid `.meta`** → warn and skip the incomplete
  logical asset. If its GUID was previously indexed and is now absent from the
  complete scan, remove that node and leave incoming GUID references unresolved;
  a later complete pair restores the node and promotes those references. Follow
  Unity's identity workflow: never invent, copy, regenerate, or silently repair
  a GUID.
- **Duplicate GUIDs** → fail with `DuplicateGuidError` before publishing any
  changes, in normal or force mode. Repair the conflicting `.meta` files through
  Unity or source control, then retry.
- **Unresolvable GUID refs** → `unresolved_refs` table; never an error.
- **Stale index** → queries answer from what is indexed. `index_status` exposes
  recorded metadata but does not establish freshness. Agents refresh explicitly;
  query tools never auto-reindex.
- **Interrupted indexing** → build into a temp DB / transaction and atomically
  swap on success; a killed run never corrupts the previous good index.
