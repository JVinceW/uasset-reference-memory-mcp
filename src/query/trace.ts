import type { GraphStore } from "../store/graph-store.js";
import { resolveRef } from "./traverse.js";
import type { AssetNode, Edge } from "../indexer/types.js";

export interface TracedPath {
  nodes: AssetNode[];
  edges: Edge[];
}

/**
 * Shortest forward reference chain from `fromRef` to `toRef` (US-007), or null
 * when either ref is unresolved or no path exists. BFS guarantees the shortest.
 */
export function tracePath(store: GraphStore, fromRef: string, toRef: string): TracedPath | null {
  const from = resolveRef(store, fromRef).node;
  const to = resolveRef(store, toRef).node;
  if (!from || !to) return null;

  if (from.guid === to.guid) return { nodes: [from], edges: [] };

  // BFS from `from`, recording the edge used to reach each node.
  const cameBy = new Map<string, Edge>();
  const visited = new Set<string>([from.guid]);
  const queue: string[] = [from.guid];

  while (queue.length > 0) {
    const guid = queue.shift()!;
    for (const e of store.outgoingEdges(guid)) {
      if (visited.has(e.toGuid)) continue;
      visited.add(e.toGuid);
      cameBy.set(e.toGuid, e);
      if (e.toGuid === to.guid) return reconstruct(store, cameBy, to);
      queue.push(e.toGuid);
    }
  }
  return null;
}

function reconstruct(store: GraphStore, cameBy: Map<string, Edge>, to: AssetNode): TracedPath {
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
    const first = store.getNode(edges[0]!.fromGuid);
    if (first) nodes.push(first);
    for (const e of edges) {
      const n = store.getNode(e.toGuid);
      if (n) nodes.push(n);
    }
  }
  return { nodes, edges };
}
