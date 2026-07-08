import Database from "better-sqlite3";
import { SCHEMA_SQL, SCHEMA_VERSION } from "./schema.js";
import type { AssetNode, AssetType, Edge, Origin, UnresolvedRef } from "../indexer/types.js";

interface AssetRow {
  guid: string;
  path: string;
  name: string;
  asset_type: string;
  origin: string;
  package_id: string | null;
  file_size: number | null;
  mtime: number;
  is_binary: number;
}

/**
 * Thin wrapper over the SQLite index store. All better-sqlite3 usage is confined
 * here so a future `node:sqlite` swap (see decision 0008) touches one file.
 */
export class GraphStore {
  readonly db: Database.Database;

  private constructor(db: Database.Database) {
    this.db = db;
  }

  /** Open (or create) the store at `path` and ensure the schema exists. */
  static open(path: string): GraphStore {
    const db = new Database(path);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.exec(SCHEMA_SQL);
    const store = new GraphStore(db);
    if (store.getMeta("schema_version") === null) {
      store.setMeta("schema_version", String(SCHEMA_VERSION));
    }
    return store;
  }

  close(): void {
    this.db.close();
  }

  // --- meta -----------------------------------------------------------------

  setMeta(key: string, value: string): void {
    this.db
      .prepare("INSERT OR REPLACE INTO index_meta (key, value) VALUES (?, ?)")
      .run(key, value);
  }

  getMeta(key: string): string | null {
    const row = this.db
      .prepare("SELECT value FROM index_meta WHERE key = ?")
      .get(key) as { value: string } | undefined;
    return row ? row.value : null;
  }

  // --- nodes ----------------------------------------------------------------

  private static readonly UPSERT_NODE = `
    INSERT OR REPLACE INTO assets
      (guid, path, name, asset_type, origin, package_id, file_size, mtime, is_binary)
    VALUES (@guid, @path, @name, @assetType, @origin, @packageId, @fileSize, @mtime, @isBinary)`;

  upsertNodes(nodes: AssetNode[]): void {
    const stmt = this.db.prepare(GraphStore.UPSERT_NODE);
    const tx = this.db.transaction((items: AssetNode[]) => {
      for (const n of items) {
        stmt.run({
          guid: n.guid,
          path: n.path,
          name: n.name,
          assetType: n.assetType,
          origin: n.origin,
          packageId: n.packageId,
          fileSize: n.fileSize,
          mtime: n.mtime,
          isBinary: n.isBinary ? 1 : 0,
        });
      }
    });
    tx(nodes);
  }

  getNode(guid: string): AssetNode | null {
    const row = this.db.prepare("SELECT * FROM assets WHERE guid = ?").get(guid) as
      | AssetRow
      | undefined;
    return row ? GraphStore.rowToNode(row) : null;
  }

  assetCount(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM assets").get() as { n: number }).n;
  }

  getNodeByPath(path: string): AssetNode | null {
    const row = this.db.prepare("SELECT * FROM assets WHERE path = ?").get(path) as
      | AssetRow
      | undefined;
    return row ? GraphStore.rowToNode(row) : null;
  }

  getNodesByName(name: string): AssetNode[] {
    const rows = this.db.prepare("SELECT * FROM assets WHERE name = ?").all(name) as AssetRow[];
    return rows.map(GraphStore.rowToNode);
  }

  /** Map of project-relative path -> {guid, mtime}, for incremental indexing. */
  getNodeMtimes(): Map<string, { guid: string; mtime: number }> {
    const rows = this.db.prepare("SELECT path, guid, mtime FROM assets").all() as {
      path: string;
      guid: string;
      mtime: number;
    }[];
    const map = new Map<string, { guid: string; mtime: number }>();
    for (const r of rows) map.set(r.path, { guid: r.guid, mtime: r.mtime });
    return map;
  }

  deleteNodesByGuid(guids: string[]): void {
    const stmt = this.db.prepare("DELETE FROM assets WHERE guid = ?");
    const tx = this.db.transaction((items: string[]) => {
      for (const g of items) stmt.run(g);
    });
    tx(guids);
  }

  // --- edges ----------------------------------------------------------------

  private static readonly INSERT_EDGE = `
    INSERT INTO edges (from_guid, to_guid, ref_kind, file_id, context, count)
    VALUES (@fromGuid, @toGuid, @refKind, @fileId, @context, @count)
    ON CONFLICT(from_guid, to_guid, ref_kind, context)
      DO UPDATE SET count = count + excluded.count`;

  insertEdges(edges: Edge[]): void {
    const stmt = this.db.prepare(GraphStore.INSERT_EDGE);
    const tx = this.db.transaction((items: Edge[]) => {
      for (const e of items) {
        stmt.run({
          fromGuid: e.fromGuid,
          toGuid: e.toGuid,
          refKind: e.refKind,
          fileId: e.fileId,
          context: e.context,
          count: e.count,
        });
      }
    });
    tx(edges);
  }

  edgeCount(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM edges").get() as { n: number }).n;
  }

  private static readonly EDGE_COLS =
    "from_guid AS fromGuid, to_guid AS toGuid, ref_kind AS refKind, file_id AS fileId, context, count";

  /** Edges originating from `guid` (its outgoing dependencies). */
  outgoingEdges(guid: string): Edge[] {
    return this.db
      .prepare(`SELECT ${GraphStore.EDGE_COLS} FROM edges WHERE from_guid = ?`)
      .all(guid) as Edge[];
  }

  /** Edges pointing at `guid` (its dependents). */
  incomingEdges(guid: string): Edge[] {
    return this.db
      .prepare(`SELECT ${GraphStore.EDGE_COLS} FROM edges WHERE to_guid = ?`)
      .all(guid) as Edge[];
  }

  /** Remove all edges and unresolved refs originating from the given guids. */
  deleteOutgoing(guids: string[]): void {
    const delEdges = this.db.prepare("DELETE FROM edges WHERE from_guid = ?");
    const delUnres = this.db.prepare("DELETE FROM unresolved_refs WHERE from_guid = ?");
    const tx = this.db.transaction((items: string[]) => {
      for (const g of items) {
        delEdges.run(g);
        delUnres.run(g);
      }
    });
    tx(guids);
  }

  /** Move edges pointing at `guid` into unresolved_refs (target no longer exists). */
  demoteIncomingToUnresolved(guid: string): void {
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO unresolved_refs (from_guid, to_guid, context)
           SELECT from_guid, to_guid, context FROM edges WHERE to_guid = ?`,
        )
        .run(guid);
      this.db.prepare("DELETE FROM edges WHERE to_guid = ?").run(guid);
    });
    tx();
  }

  /** Move unresolved refs pointing at `guid` into typed edges (target now exists). */
  promoteUnresolved(guid: string, refKind: string): void {
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO edges (from_guid, to_guid, ref_kind, file_id, context, count)
           SELECT from_guid, to_guid, ?, NULL, context, 1
           FROM unresolved_refs WHERE to_guid = ?
           ON CONFLICT(from_guid, to_guid, ref_kind, context)
             DO UPDATE SET count = count + 1`,
        )
        .run(refKind, guid);
      this.db.prepare("DELETE FROM unresolved_refs WHERE to_guid = ?").run(guid);
    });
    tx();
  }

  // --- unresolved -----------------------------------------------------------

  insertUnresolved(refs: UnresolvedRef[]): void {
    const stmt = this.db.prepare(
      "INSERT INTO unresolved_refs (from_guid, to_guid, context) VALUES (?, ?, ?)",
    );
    const tx = this.db.transaction((items: UnresolvedRef[]) => {
      for (const r of items) stmt.run(r.fromGuid, r.toGuid, r.context);
    });
    tx(refs);
  }

  unresolvedCount(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM unresolved_refs").get() as { n: number })
      .n;
  }

  private static rowToNode(row: AssetRow): AssetNode {
    return {
      guid: row.guid,
      path: row.path,
      name: row.name,
      assetType: row.asset_type as AssetType,
      origin: row.origin as Origin,
      packageId: row.package_id,
      fileSize: row.file_size,
      mtime: row.mtime,
      isBinary: row.is_binary === 1,
    };
  }
}
