import type { QueryDb } from "./db.js";
import { getEdges, type EdgeDetail } from "./edges.js";
import { findReferences, getDependencies, resolveRef, type SubgraphNode } from "./traverse.js";
import { rowToNode, rowToEdge, EDGE_COLS } from "../store/row.js";
import { SCHEMA_VERSION } from "../store/schema.js";
import type { AssetNode, AssetType, Edge, Origin } from "../indexer/types.js";

export interface IndexStatus {
  schemaVersion: string | null;
  expectedSchemaVersion: number;
  projectRoot: string | null;
  indexedAt: string | null;
  assetCount: number;
  edgeCount: number;
  unresolvedCount: number;
  addressableCount: number;
  packagesLockMtime: string | null;
  packageDiscoveryFingerprint: string | null;
  unityVersion: string | null;
}

export interface AssetDetail {
  asset: AssetNode;
  inbound: EdgeDetail[];
  outbound: EdgeDetail[];
  inboundCount: number;
  outboundCount: number;
}

export interface GraphFilters {
  types?: AssetType[];
  origins?: Origin[];
  pathPrefix?: string;
  hideBuiltin?: boolean;
  limit?: number;
}

export interface ViewerNode {
  data: {
    id: string;
    label: string;
    type: AssetType;
    origin: Origin;
    path: string;
    distance: number;
    degree: number;
    inbound: number;
    outbound: number;
  };
}

export interface ViewerEdge {
  data: {
    id: string;
    source: string;
    target: string;
    kind: string;
    context: string | null;
    fileId: string | null;
    count: number;
  };
}

export interface ViewerGraph {
  rootId: string;
  nodes: ViewerNode[];
  edges: ViewerEdge[];
  totalCandidates?: number;
  truncated?: boolean;
}

export interface RootTrace extends ViewerGraph {
  dir: "deps" | "refs";
  depth: number;
  byDistance: Record<string, number>;
}

interface RankedNodeRow extends Record<string, unknown> {
  degree: number;
  inbound: number;
  outbound: number;
}

export function getIndexStatus(db: QueryDb): IndexStatus {
  const meta = (key: string): string | null =>
    (db.all("SELECT value FROM index_meta WHERE key = ?", [key])[0]?.value as string | undefined) ?? null;
  const scalar = (sql: string): number => (db.all(sql)[0]?.n as number | undefined) ?? 0;

  return {
    schemaVersion: meta("schema_version"),
    expectedSchemaVersion: SCHEMA_VERSION,
    projectRoot: meta("project_root"),
    indexedAt: meta("indexed_at"),
    assetCount: scalar("SELECT COUNT(*) AS n FROM assets"),
    edgeCount: scalar("SELECT COUNT(*) AS n FROM edges"),
    unresolvedCount: scalar("SELECT COUNT(*) AS n FROM unresolved_refs"),
    addressableCount: scalar("SELECT COUNT(*) AS n FROM addressable_entries"),
    packagesLockMtime: meta("packages_lock_mtime"),
    packageDiscoveryFingerprint: meta("package_discovery_fingerprint"),
    unityVersion: meta("unity_version"),
  };
}

export function getAssetDetail(db: QueryDb, ref: string, limit = 100): AssetDetail | null {
  const asset = resolveRef(db, ref).node;
  if (!asset) return null;
  const inbound = getEdges(db, { to: asset.guid, limit });
  const outbound = getEdges(db, { from: asset.guid, limit });
  const counts = db.all(
    `SELECT
      (SELECT COUNT(*) FROM edges WHERE to_guid = ?) AS inboundCount,
      (SELECT COUNT(*) FROM edges WHERE from_guid = ?) AS outboundCount`,
    [asset.guid, asset.guid],
  )[0];

  return {
    asset,
    inbound,
    outbound,
    inboundCount: (counts?.inboundCount as number | undefined) ?? inbound.length,
    outboundCount: (counts?.outboundCount as number | undefined) ?? outbound.length,
  };
}

export function getBudgetedGraph(db: QueryDb, filters: GraphFilters = {}): ViewerGraph {
  const where: string[] = [];
  const params: unknown[] = [];
  const limit = clampLimit(filters.limit ?? 320, 1, 5000);

  addInFilter(where, params, "a.asset_type", filters.types);
  addInFilter(where, params, "a.origin", filters.origins);
  if (filters.hideBuiltin) where.push("a.origin <> 'builtin'");
  if (filters.pathPrefix) {
    where.push("a.path LIKE ?");
    params.push(`${filters.pathPrefix}%`);
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const count = db.all(`SELECT COUNT(*) AS n FROM assets a ${clause}`, params)[0]?.n as number | undefined;
  const rows = db.all(
    `SELECT a.*,
       COALESCE(out_e.outbound, 0) AS outbound,
       COALESCE(in_e.inbound, 0) AS inbound,
       COALESCE(out_e.outbound, 0) + COALESCE(in_e.inbound, 0) AS degree
     FROM assets a
     LEFT JOIN (
       SELECT from_guid, SUM(count) AS outbound FROM edges GROUP BY from_guid
     ) out_e ON out_e.from_guid = a.guid
     LEFT JOIN (
       SELECT to_guid, SUM(count) AS inbound FROM edges GROUP BY to_guid
     ) in_e ON in_e.to_guid = a.guid
     ${clause}
     ORDER BY degree DESC, a.path
     LIMIT ?`,
    [...params, limit],
  ) as RankedNodeRow[];

  const nodes = rows.map((row) => rankedNodeToViewer(row, 0));
  const ids = nodes.map((node) => node.data.id);
  return {
    rootId: "",
    nodes,
    edges: edgesAmong(db, ids),
    totalCandidates: count ?? nodes.length,
    truncated: (count ?? nodes.length) > nodes.length,
  };
}

export function getRootTrace(
  db: QueryDb,
  ref: string,
  dir: "deps" | "refs",
  depth: number,
  limit = 320,
): RootTrace | null {
  const sub = dir === "refs" ? findReferences(db, ref, depth) : getDependencies(db, ref, depth);
  if (!sub) return null;
  const nodeLimit = clampLimit(limit, 1, 5000);
  const kept = [...sub.nodes]
    .sort((a, b) => a.distance - b.distance || a.path.localeCompare(b.path))
    .slice(0, nodeLimit);
  const keptIds = new Set(kept.map((node) => node.guid));
  const edges = sub.edges.filter((edge) => keptIds.has(edge.fromGuid) && keptIds.has(edge.toGuid));
  const byDistance: Record<string, number> = {};
  for (const node of kept) byDistance[String(node.distance)] = (byDistance[String(node.distance)] ?? 0) + 1;

  return {
    rootId: sub.root.guid,
    nodes: kept.map((node) => subgraphNodeToViewer(db, node)),
    edges: edges.map(edgeToViewer),
    totalCandidates: sub.nodes.length,
    truncated: sub.nodes.length > kept.length,
    dir,
    depth,
    byDistance,
  };
}

function rankedNodeToViewer(row: RankedNodeRow, distance: number): ViewerNode {
  const node = rowToNode(row);
  const inbound = (row.inbound as number | undefined) ?? 0;
  const outbound = (row.outbound as number | undefined) ?? 0;
  return {
    data: {
      id: node.guid,
      label: node.name,
      type: node.assetType,
      origin: node.origin,
      path: node.path,
      distance,
      degree: (row.degree as number | undefined) ?? inbound + outbound,
      inbound,
      outbound,
    },
  };
}

function subgraphNodeToViewer(db: QueryDb, node: SubgraphNode): ViewerNode {
  const counts = db.all(
    `SELECT
      COALESCE((SELECT SUM(count) FROM edges WHERE to_guid = ?), 0) AS inbound,
      COALESCE((SELECT SUM(count) FROM edges WHERE from_guid = ?), 0) AS outbound`,
    [node.guid, node.guid],
  )[0];
  const inbound = (counts?.inbound as number | undefined) ?? 0;
  const outbound = (counts?.outbound as number | undefined) ?? 0;
  return {
    data: {
      id: node.guid,
      label: node.name,
      type: node.assetType,
      origin: node.origin,
      path: node.path,
      distance: node.distance,
      degree: inbound + outbound,
      inbound,
      outbound,
    },
  };
}

function edgesAmong(db: QueryDb, guids: string[]): ViewerEdge[] {
  if (guids.length === 0) return [];
  const placeholders = guids.map(() => "?").join(", ");
  const rows = db.all(
    `SELECT ${EDGE_COLS}
     FROM edges
     WHERE from_guid IN (${placeholders}) AND to_guid IN (${placeholders})
     ORDER BY count DESC, from_guid, to_guid`,
    [...guids, ...guids],
  );
  return rows.map(rowToEdge).map(edgeToViewer);
}

function edgeToViewer(edge: Edge): ViewerEdge {
  return {
    data: {
      id: `${edge.fromGuid}->${edge.toGuid}:${edge.refKind}:${edge.context ?? ""}:${edge.fileId ?? ""}`,
      source: edge.fromGuid,
      target: edge.toGuid,
      kind: edge.refKind,
      context: edge.context,
      fileId: edge.fileId,
      count: edge.count,
    },
  };
}

function addInFilter<T extends string>(
  where: string[],
  params: unknown[],
  column: string,
  values: T[] | undefined,
): void {
  if (!values || values.length === 0) return;
  where.push(`${column} IN (${values.map(() => "?").join(", ")})`);
  params.push(...values);
}

function clampLimit(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}
