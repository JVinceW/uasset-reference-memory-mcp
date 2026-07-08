import type { QueryDb } from "./db.js";
import { getNode, outgoingEdges, resolveRef } from "./traverse.js";
import type { AssetNode, Edge } from "../indexer/types.js";

export interface TracedPath {
  nodes: AssetNode[];
  edges: Edge[];
}

/**
 * Shortest forward reference chain from `fromRef` to `toRef` (US-007), or null
 * when either ref is unresolved or no path exists. BFS guarantees the shortest.
 */
export function tracePath(db: QueryDb, fromRef: string, toRef: string): TracedPath | null {
  const from = resolveRef(db, fromRef).node;
  const to = resolveRef(db, toRef).node;
  if (!from || !to) return null;

  if (from.guid === to.guid) return { nodes: [from], edges: [] };

  const cameBy = new Map<string, Edge>();
  const visited = new Set<string>([from.guid]);
  const queue: string[] = [from.guid];

  while (queue.length > 0) {
    const guid = queue.shift()!;
    for (const e of outgoingEdges(db, guid)) {
      if (visited.has(e.toGuid)) continue;
      visited.add(e.toGuid);
      cameBy.set(e.toGuid, e);
      if (e.toGuid === to.guid) return reconstruct(db, cameBy, to);
      queue.push(e.toGuid);
    }
  }
  return null;
}

function reconstruct(db: QueryDb, cameBy: Map<string, Edge>, to: AssetNode): TracedPath {
  const edges: Edge[] = [];
  let cursor = to.guid;
  while (cameBy.has(cursor)) {
    const e = cameBy.get(cursor)!;
    edges.push(e);
    cursor = e.fromGuid;
  }
  edges.reverse();

  const nodes: AssetNode[] = [];
  if (edges.length > 0) {
    const first = getNode(db, edges[0]!.fromGuid);
    if (first) nodes.push(first);
    for (const e of edges) {
      const n = getNode(db, e.toGuid);
      if (n) nodes.push(n);
    }
  }
  return { nodes, edges };
}
