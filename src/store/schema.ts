/**
 * The index store schema. This is the public contract (goal #5): any external
 * tool reads these tables directly. See docs/product/asset-graph-model.md.
 * Bump SCHEMA_VERSION on any breaking change and record it in a decision.
 */
export const SCHEMA_VERSION = 3;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS assets (
  guid        TEXT PRIMARY KEY,
  path        TEXT NOT NULL,
  name        TEXT NOT NULL,
  asset_type  TEXT NOT NULL,
  origin      TEXT NOT NULL,
  package_id  TEXT,
  file_size   INTEGER,
  mtime       INTEGER,
  is_binary   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assets_name ON assets(name);
CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_assets_path ON assets(path);

CREATE TABLE IF NOT EXISTS edges (
  from_guid  TEXT NOT NULL,
  to_guid    TEXT NOT NULL,
  ref_kind   TEXT NOT NULL,
  file_id    TEXT,
  context    TEXT,
  count      INTEGER DEFAULT 1,
  PRIMARY KEY (from_guid, to_guid, ref_kind, context)
);
CREATE INDEX IF NOT EXISTS idx_edges_to   ON edges(to_guid);
CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_guid);

CREATE TABLE IF NOT EXISTS unresolved_refs (
  from_guid TEXT NOT NULL,
  to_guid   TEXT NOT NULL,
  context   TEXT
);

CREATE TABLE IF NOT EXISTS index_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS addressable_groups (
  group_guid TEXT PRIMARY KEY,
  asset_guid TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  path       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS addressable_entries (
  guid       TEXT PRIMARY KEY,
  address    TEXT NOT NULL,
  group_guid TEXT NOT NULL REFERENCES addressable_groups(group_guid) ON DELETE CASCADE,
  read_only  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_addressable_entries_address
  ON addressable_entries(address);
CREATE INDEX IF NOT EXISTS idx_addressable_entries_group
  ON addressable_entries(group_guid);

CREATE TABLE IF NOT EXISTS addressable_entry_labels (
  entry_guid TEXT NOT NULL REFERENCES addressable_entries(guid) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  PRIMARY KEY (entry_guid, label)
);
CREATE INDEX IF NOT EXISTS idx_addressable_labels_label
  ON addressable_entry_labels(label);
`;
