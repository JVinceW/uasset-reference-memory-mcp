import Database from "better-sqlite3";
import { SCHEMA_SQL, SCHEMA_VERSION } from "./schema.js";
import { rowToNode, type AssetRow } from "./row.js";
import type { QueryDb } from "../query/db.js";
import type { AssetNode, Edge, UnresolvedRef } from "../indexer/types.js";
import type { AddressableGroup } from "../indexer/addressables.js";

export type { AssetRow } from "./row.js";

/**
 * Thin wrapper over the SQLite index store. All better-sqlite3 usage is confined
 * here so a future `node:sqlite` swap (see decision 0008) touches one file.
 */
export class GraphStore implements QueryDb {
  readonly db: Database.Database;

  private constructor(db: Database.Database) {
    this.db = db;
  }

  /** QueryDb: run a read query and return object rows (shared with the WASM store). */
  all(sql: string, params: unknown[] = []): Record<string, unknown>[] {
    return this.db.prepare(sql).all(...params) as Record<string, unknown>[];
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

  static readSchemaVersion(path: string): number | null {
    const db = new Database(path, { readonly: true, fileMustExist: true });
    try {
      const row = db.prepare("SELECT value FROM index_meta WHERE key = 'schema_version'").get() as
        | { value: string }
        | undefined;
      return row ? Number(row.value) : null;
    } finally {
      db.close();
    }
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
    return row ? rowToNode(row) : null;
  }

  assetCount(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM assets").get() as { n: number }).n;
  }

  getNodeByPath(path: string): AssetNode | null {
    const row = this.db.prepare("SELECT * FROM assets WHERE path = ?").get(path) as
      | AssetRow
      | undefined;
    return row ? rowToNode(row) : null;
  }

  getNodesByName(name: string): AssetNode[] {
    const rows = this.db.prepare("SELECT * FROM assets WHERE name = ?").all(name) as AssetRow[];
    return rows.map(rowToNode);
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

  /** Distinct sources with edges pointing at any of the given target guids. */
  incomingSourceGuids(targetGuids: string[]): string[] {
    return this.sourceGuidsForTargets("edges", targetGuids);
  }

  private sourceGuidsForTargets(
    table: "edges" | "unresolved_refs",
    targetGuids: string[],
  ): string[] {
    const sources = new Set<string>();
    const chunkSize = 500;
    for (let start = 0; start < targetGuids.length; start += chunkSize) {
      const chunk = targetGuids.slice(start, start + chunkSize);
      const placeholders = chunk.map(() => "?").join(", ");
      const rows = this.db
        .prepare(
          `SELECT DISTINCT from_guid AS guid FROM ${table}
           WHERE to_guid IN (${placeholders})`,
        )
        .all(...chunk) as { guid: string }[];
      for (const row of rows) sources.add(row.guid);
    }
    return [...sources].sort();
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

  /** Distinct sources with unresolved refs pointing at any given target guid. */
  unresolvedSourceGuids(targetGuids: string[]): string[] {
    return this.sourceGuidsForTargets("unresolved_refs", targetGuids);
  }

  unresolvedCount(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM unresolved_refs").get() as { n: number })
      .n;
  }

  // --- addressables ---------------------------------------------------------

  private insertAddressableGroups(groups: AddressableGroup[]): void {
    const insertGroup = this.db.prepare(`
      INSERT INTO addressable_groups (group_guid, asset_guid, name, path)
      VALUES (@groupGuid, @assetGuid, @name, @path)`);
    const insertEntry = this.db.prepare(`
      INSERT INTO addressable_entries (guid, address, group_guid, read_only)
      VALUES (@guid, @address, @groupGuid, @readOnly)`);
    const insertLabel = this.db.prepare(`
      INSERT INTO addressable_entry_labels (entry_guid, label)
      VALUES (?, ?)`);

    for (const group of groups) {
      insertGroup.run({
        groupGuid: group.groupGuid,
        assetGuid: group.assetGuid,
        name: group.name,
        path: group.path,
      });
      for (const entry of group.entries) {
        insertEntry.run({
          guid: entry.guid,
          address: entry.address,
          groupGuid: group.groupGuid,
          readOnly: entry.readOnly ? 1 : 0,
        });
        for (const label of entry.labels) insertLabel.run(entry.guid, label);
      }
    }
  }

  replaceAddressableGroups(groups: AddressableGroup[]): void {
    const tx = this.db.transaction((items: AddressableGroup[]) => {
      this.db.prepare("DELETE FROM addressable_groups").run();
      this.insertAddressableGroups(items);
    });
    tx(groups);
  }

  replaceAddressableGroupsForAssets(assetGuids: string[], groups: AddressableGroup[]): void {
    const deleteGroup = this.db.prepare("DELETE FROM addressable_groups WHERE asset_guid = ?");
    const tx = this.db.transaction((guids: string[], items: AddressableGroup[]) => {
      for (const guid of guids) deleteGroup.run(guid);
      this.insertAddressableGroups(items);
    });
    tx(assetGuids, groups);
  }

  addressableCount(): number {
    return (this.db.prepare("SELECT COUNT(*) AS n FROM addressable_entries").get() as { n: number })
      .n;
  }

}
