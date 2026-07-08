import { writeFile } from "node:fs/promises";
import type { QueryDb } from "../query/db.js";
import { EDGE_COLS } from "../store/row.js";

export interface GraphJson {
  meta: {
    schemaVersion: number;
    indexedAt: string | null;
    assetCount: number;
    edgeCount: number;
    unresolvedCount: number;
    addressableCount: number;
  };
  assets: {
    guid: string;
    path: string;
    name: string;
    assetType: string;
    origin: string;
    packageId: string | null;
    fileSize: number | null;
    isBinary: boolean;
  }[];
  edges: {
    from: string;
    to: string;
    refKind: string;
    context: string | null;
    fileId: string | null;
    count: number;
  }[];
  unresolved: { from: string; toGuid: string; context: string | null }[];
  addressables: { guid: string; address: string }[];
}

/**
 * Export the whole graph as a stable, git-diffable JSON object (E10). Rows are
 * sorted deterministically so re-indexing yields minimal diffs. Complements the
 * compact binary snapshot (`index.db.br`).
 */
export function exportGraphJson(db: QueryDb): GraphJson {
  const assets = db
    .all(
      `SELECT guid, path, name, asset_type AS assetType, origin, package_id AS packageId,
              file_size AS fileSize, is_binary AS isBinary
       FROM assets ORDER BY path, guid`,
    )
    .map((r) => ({
      guid: r.guid as string,
      path: r.path as string,
      name: r.name as string,
      assetType: r.assetType as string,
      origin: r.origin as string,
      packageId: (r.packageId as string | null) ?? null,
      fileSize: (r.fileSize as number | null) ?? null,
      isBinary: r.isBinary === 1,
    }));

  const edges = db
    .all(
      `SELECT af.path AS "from", at.path AS "to", ${EDGE_COLS}
       FROM edges e
       JOIN assets af ON af.guid = e.from_guid
       JOIN assets at ON at.guid = e.to_guid
       ORDER BY af.path, at.path, e.ref_kind, e.context`,
    )
    .map((r) => ({
      from: r.from as string,
      to: r.to as string,
      refKind: r.refKind as string,
      context: (r.context as string | null) ?? null,
      fileId: (r.fileId as string | null) ?? null,
      count: (r.count as number) ?? 1,
    }));

  const unresolved = db
    .all(
      `SELECT af.path AS "from", u.to_guid AS toGuid, u.context
       FROM unresolved_refs u JOIN assets af ON af.guid = u.from_guid
       ORDER BY af.path, u.to_guid, u.context`,
    )
    .map((r) => ({
      from: r.from as string,
      toGuid: r.toGuid as string,
      context: (r.context as string | null) ?? null,
    }));

  const addressables = db
    .all("SELECT guid, address FROM addressable_entries ORDER BY address, guid")
    .map((r) => ({ guid: r.guid as string, address: r.address as string }));

  return {
    meta: {
      schemaVersion: Number((db.all("SELECT value FROM index_meta WHERE key='schema_version'")[0]?.value as string) ?? 0),
      indexedAt: (db.all("SELECT value FROM index_meta WHERE key='indexed_at'")[0]?.value as string) ?? null,
      assetCount: assets.length,
      edgeCount: edges.length,
      unresolvedCount: unresolved.length,
      addressableCount: addressables.length,
    },
    assets,
    edges,
    unresolved,
    addressables,
  };
}

/** Write the JSON graph to `outPath` (pretty-printed, trailing newline). */
export async function writeGraphJson(db: QueryDb, outPath: string): Promise<GraphJson> {
  const graph = exportGraphJson(db);
  await writeFile(outPath, JSON.stringify(graph, null, 2) + "\n");
  return graph;
}
