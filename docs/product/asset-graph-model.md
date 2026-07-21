# Asset Graph Model (SQLite Contract)

The index is a single SQLite file at `.asset-memory/index.db` in the Unity
project root. This schema is the **public contract** — the MCP server, the Unity
verify step, and any future external tool all depend on it. `index_meta.schema_version`
is mandatory so consumers know what they are reading.

## `assets` (nodes)

```sql
CREATE TABLE assets (
  guid        TEXT PRIMARY KEY,   -- Unity GUID from the .meta
  path        TEXT NOT NULL,      -- 'Assets/Prefabs/Player.prefab'
  name        TEXT NOT NULL,      -- basename, for fast search
  asset_type  TEXT NOT NULL,      -- Prefab|Scene|Material|Texture|Script|Shader
                                  -- |AnimationClip|AnimatorController
                                  -- |ScriptableObject|Sprite|AudioClip|Font
                                  -- |Model|Folder|Other
  origin      TEXT NOT NULL,      -- 'project' | 'package' | 'builtin'
  package_id  TEXT,               -- e.g. 'com.unity.render-pipelines.universal@14.0.8'
  file_size   INTEGER,
  mtime       INTEGER,            -- for incremental re-index
  is_binary   INTEGER NOT NULL    -- 1 = cannot be scanned for outgoing refs
);
CREATE INDEX idx_assets_name ON assets(name);
CREATE INDEX idx_assets_type ON assets(asset_type);
CREATE INDEX idx_assets_path ON assets(path);
```

- `asset_type` derived from extension + importer type in the `.meta`.
- Folders get nodes (cheap; enables path-scoped queries).
- Built-in Unity assets (sentinel GUIDs such as
  `0000000000000000f000000000000000`) are pre-seeded synthetic `origin='builtin'`
  nodes so references to them resolve.

## `edges` (references)

```sql
CREATE TABLE edges (
  from_guid  TEXT NOT NULL,       -- asset whose file contains the reference
  to_guid    TEXT NOT NULL,       -- referenced asset
  ref_kind   TEXT NOT NULL,
  file_id    TEXT,                -- Unity fileID at ref site (future sub-asset use)
  context    TEXT,                -- YAML property: 'm_Materials','m_Script','_MainTex'
  count      INTEGER DEFAULT 1,   -- duplicate refs collapse into one row
  PRIMARY KEY (from_guid, to_guid, ref_kind, context)
);
CREATE INDEX idx_edges_to   ON edges(to_guid);
CREATE INDEX idx_edges_from ON edges(from_guid);
```

`ref_kind` (v1): `USES_SCRIPT`, `USES_MATERIAL`, `USES_TEXTURE`, `USES_SHADER`,
`USES_MESH`, `USES_ANIMATION`, `NESTED_PREFAB`, `SERIALIZED_REF` (catch-all).
Extensible later with `CODE_REF`, `ADDRESSABLE_REF` without a schema change.

## `unresolved_refs` (broken-reference detector)

```sql
CREATE TABLE unresolved_refs (
  from_guid TEXT NOT NULL,
  to_guid   TEXT NOT NULL,   -- GUID resolving to nothing (not project/package/builtin)
  context   TEXT
);
```

A GUID resolving nowhere is a genuinely broken reference (deleted asset or missing
package). Free QA output of indexing; never an indexing error.

## `index_meta` (bookkeeping)

```sql
CREATE TABLE index_meta (
  key   TEXT PRIMARY KEY,  -- schema_version, project_root, indexed_at,
  value TEXT               -- unity_version, asset_count, verify_last_run, ...
);
```

## Addressables authoring metadata

Schema 3 preserves normalized, read-only Addressables authoring state:

```sql
CREATE TABLE addressable_groups (
  group_guid TEXT PRIMARY KEY,  -- Addressables group identity
  asset_guid TEXT NOT NULL UNIQUE, -- Unity GUID of the group asset
  name       TEXT NOT NULL,
  path       TEXT NOT NULL
);

CREATE TABLE addressable_entries (
  guid       TEXT PRIMARY KEY,  -- GUID of the addressed asset
  address    TEXT NOT NULL,
  group_guid TEXT NOT NULL REFERENCES addressable_groups(group_guid)
                                   ON DELETE CASCADE,
  read_only  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_addressable_entries_address ON addressable_entries(address);
CREATE INDEX idx_addressable_entries_group ON addressable_entries(group_guid);

CREATE TABLE addressable_entry_labels (
  entry_guid TEXT NOT NULL REFERENCES addressable_entries(guid)
                                   ON DELETE CASCADE,
  label      TEXT NOT NULL,
  PRIMARY KEY (entry_guid, label)
);
CREATE INDEX idx_addressable_labels_label ON addressable_entry_labels(label);
```

`group_guid` is Addressables identity; `asset_guid` connects the group asset to
the Unity asset graph without making it a runtime-content dependency. One asset
has at most one current group membership. Duplicate addresses remain visible.
These tables do not model group schemas or bundle configuration.

## Traversal

- **Impact analysis** = reverse lookup on `idx_edges_to`.
- **Dependencies** = forward lookup on `idx_edges_from`.
- **Transitive / path** = recursive CTEs, or BFS in TypeScript for bounded depth.

## Deliberate v1 simplification

Edges are **asset-level (GUID→GUID)**, not GameObject-level. We record *that*
`Player.prefab` uses `body.mat` and on which property, not *which child
GameObject*. `file_id` reserves the sub-asset upgrade slot.
