import type { QueryDb } from "./db.js";
import { rowToNode, rowToEdge, EDGE_COLS } from "../store/row.js";
import type { AssetNode, Edge } from "../indexer/types.js";

const GUID_RE = /^[0-9a-f]{32}$/i;

export interface ResolveResult {
  node: AssetNode | null;
  reason?: "not-found" | "ambiguous";
  candidates?: AssetNode[];
}

export type SubgraphNode = AssetNode & { distance: number };

export interface Subgraph {
  root: AssetNode;
  nodes: SubgraphNode[];
  edges: Edge[];
}

// --- db-backed primitives (shared by all query modules) --------------------

export function getNode(db: QueryDb, guid: string): AssetNode | null {
  const rows = db.all("SELECT * FROM assets WHERE guid = ?", [guid]);
  return rows[0] ? rowToNode(rows[0]) : null;
}

export function outgoingEdges(db: QueryDb, guid: string): Edge[] {
  return db.all(`SELECT ${EDGE_COLS} FROM edges WHERE from_guid = ?`, [guid]).map(rowToEdge);
}

export function incomingEdges(db: QueryDb, guid: string): Edge[] {
  return db.all(`SELECT ${EDGE_COLS} FROM edges WHERE to_guid = ?`, [guid]).map(rowToEdge);
}

/**
 * Resolve an asset reference to a node. Precedence: exact guid, then exact path,
 * then unique name. Ambiguous name or no match returns node=null with a reason.
 */
export function resolveRef(db: QueryDb, ref: string): ResolveResult {
  if (GUID_RE.test(ref)) {
    const node = getNode(db, ref.toLowerCase());
    return node ? { node } : { node: null, reason: "not-found" };
  }

  const byPath = db.all("SELECT * FROM assets WHERE path = ?", [ref]);
  if (byPath[0]) return { node: rowToNode(byPath[0]) };

  const byName = db.all("SELECT * FROM assets WHERE name = ?", [ref]).map(rowToNode);
  if (byName.length === 1) return { node: byName[0]! };
  if (byName.length > 1) return { node: null, reason: "ambiguous", candidates: byName };
  return { node: null, reason: "not-found" };
}

/** Forward traversal: everything this asset depends on, out to `depth` (-1 = full). */
export function getDependencies(db: QueryDb, ref: string, depth: number): Subgraph | null {
  return traverse(db, ref, depth, "forward");
}

/** Backward traversal: everything that references this asset (impact analysis). */
export function findReferences(db: QueryDb, ref: string, depth: number): Subgraph | null {
  return traverse(db, ref, depth, "backward");
}

function traverse(
  db: QueryDb,
  ref: string,
  depth: number,
  direction: "forward" | "backward",
): Subgraph | null {
  const root = resolveRef(db, ref).node;
  if (!root) return null;

  const nodes = new Map<string, SubgraphNode>([[root.guid, { ...root, distance: 0 }]]);
  const edges: Edge[] = [];
  const queue: string[] = [root.guid];

  while (queue.length > 0) {
    const guid = queue.shift()!;
    const d = nodes.get(guid)!.distance;
    if (depth >= 0 && d >= depth) continue;

    const stepEdges = direction === "forward" ? outgoingEdges(db, guid) : incomingEdges(db, guid);
    for (const e of stepEdges) {
      edges.push(e);
      const nextGuid = direction === "forward" ? e.toGuid : e.fromGuid;
      if (nodes.has(nextGuid)) continue;
      const nextNode = getNode(db, nextGuid);
      if (!nextNode) continue;
      nodes.set(nextGuid, { ...nextNode, distance: d + 1 });
      queue.push(nextGuid);
    }
  }

  return { root, nodes: [...nodes.values()], edges };
}
