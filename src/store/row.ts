import type { AssetNode, AssetType, Edge, Origin } from "../indexer/types.js";

/** Raw `assets` row (snake_case columns) shared by every SQLite engine. */
export interface AssetRow {
  [key: string]: unknown;
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

export function rowToNode(row: Record<string, unknown>): AssetNode {
  return {
    guid: row.guid as string,
    path: row.path as string,
    name: row.name as string,
    assetType: row.asset_type as AssetType,
    origin: row.origin as Origin,
    packageId: (row.package_id as string | null) ?? null,
    fileSize: (row.file_size as number | null) ?? null,
    mtime: row.mtime as number,
    isBinary: row.is_binary === 1,
  };
}

/** Edge column projection that aliases to the camelCase `Edge` shape. */
export const EDGE_COLS =
  "from_guid AS fromGuid, to_guid AS toGuid, ref_kind AS refKind, file_id AS fileId, context, count";

export function rowToEdge(row: Record<string, unknown>): Edge {
  return {
    fromGuid: row.fromGuid as string,
    toGuid: row.toGuid as string,
    refKind: row.refKind as Edge["refKind"],
    fileId: (row.fileId as string | null) ?? null,
    context: (row.context as string | null) ?? null,
    count: (row.count as number) ?? 1,
  };
}
