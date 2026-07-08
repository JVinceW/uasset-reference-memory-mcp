import type { QueryDb } from "./db.js";
import { rowToNode } from "../store/row.js";
import type { AssetNode, AssetType, Origin } from "../indexer/types.js";

export interface SearchFilters {
  name?: string;
  type?: AssetType;
  pathPrefix?: string;
  origin?: Origin;
  /** Inbound reference-count bounds (how many assets reference this one). */
  minRefs?: number;
  maxRefs?: number;
  limit?: number;
}

/** Structured node search with inbound reference-count filters (US-008). */
export function searchAssets(db: QueryDb, filters: SearchFilters = {}): AssetNode[] {
  const where: string[] = [];
  const params: unknown[] = [];
  const inbound = "(SELECT COUNT(*) FROM edges WHERE to_guid = a.guid)";

  if (filters.name) {
    where.push("a.name LIKE ?");
    params.push(`%${filters.name}%`);
  }
  if (filters.type) {
    where.push("a.asset_type = ?");
    params.push(filters.type);
  }
  if (filters.pathPrefix) {
    where.push("a.path LIKE ?");
    params.push(`${filters.pathPrefix}%`);
  }
  if (filters.origin) {
    where.push("a.origin = ?");
    params.push(filters.origin);
  }
  if (filters.minRefs !== undefined) {
    where.push(`${inbound} >= ?`);
    params.push(filters.minRefs);
  }
  if (filters.maxRefs !== undefined) {
    where.push(`${inbound} <= ?`);
    params.push(filters.maxRefs);
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limit = filters.limit ?? 500;
  return db
    .all(`SELECT a.* FROM assets a ${clause} ORDER BY a.path LIMIT ?`, [...params, limit])
    .map(rowToNode);
}

export interface Overview {
  totalAssets: number;
  byType: Record<string, number>;
  byOrigin: Record<string, number>;
  edgeCount: number;
  unresolvedCount: number;
  /** Distinct guids that resolve to nothing (broken references). */
  brokenRefGuids: number;
  /** Most-referenced assets (dependency hubs). */
  topReferenced: { path: string; name: string; refCount: number }[];
}

/** Architecture overview: counts, hubs, and broken-ref summary (US-008). */
export function getOverview(db: QueryDb): Overview {
  const scalar = (sql: string): number => (db.all(sql)[0]?.n as number) ?? 0;
  const countMap = (sql: string): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const r of db.all(sql)) out[r.k as string] = r.c as number;
    return out;
  };

  const topReferenced = db.all(
    `SELECT a.path, a.name, COUNT(e.from_guid) AS refCount
     FROM assets a JOIN edges e ON e.to_guid = a.guid
     GROUP BY a.guid ORDER BY refCount DESC, a.path LIMIT 20`,
  ) as unknown as { path: string; name: string; refCount: number }[];

  return {
    totalAssets: scalar("SELECT COUNT(*) AS n FROM assets"),
    byType: countMap("SELECT asset_type AS k, COUNT(*) AS c FROM assets GROUP BY asset_type"),
    byOrigin: countMap("SELECT origin AS k, COUNT(*) AS c FROM assets GROUP BY origin"),
    edgeCount: scalar("SELECT COUNT(*) AS n FROM edges"),
    unresolvedCount: scalar("SELECT COUNT(*) AS n FROM unresolved_refs"),
    brokenRefGuids: scalar("SELECT COUNT(DISTINCT to_guid) AS n FROM unresolved_refs"),
    topReferenced,
  };
}
