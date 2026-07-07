/**
 * The index store schema. This is the public contract (goal #5): any external
 * tool reads these tables directly. See docs/product/asset-graph-model.md.
 * Bump SCHEMA_VERSION on any breaking change and record it in a decision.
 */
export const SCHEMA_VERSION = 1;

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
`;
