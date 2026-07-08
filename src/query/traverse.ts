import type { GraphStore } from "../store/graph-store.js";
import type { AssetNode, Edge } from "../indexer/types.js";

const GUID_RE = /^[0-9a-f]{32}$/i;

export interface ResolveResult {
  node: AssetNode | null;
  reason?: "not-found" | "ambiguous";
  /** Present when reason is 'ambiguous'. */
  candidates?: AssetNode[];
}

export type SubgraphNode = AssetNode & { distance: number };

export interface Subgraph {
  root: AssetNode;
  nodes: SubgraphNode[];
  edges: Edge[];
}

/**
 * Resolve an asset reference to a node. Precedence: exact guid, then exact path,
 * then unique name. An ambiguous name or no match returns node=null with a reason.
 */
export function resolveRef(store: GraphStore, ref: string): ResolveResult {
  if (GUID_RE.test(ref)) {
    const node = store.getNode(ref.toLowerCase());
    return node ? { node } : { node: null, reason: "not-found" };
  }

  const byPath = store.getNodeByPath(ref);
  if (byPath) return { node: byPath };

  const byName = store.getNodesByName(ref);
  if (byName.length === 1) return { node: byName[0]! };
  if (byName.length > 1) return { node: null, reason: "ambiguous", candidates: byName };
  return { node: null, reason: "not-found" };
}

/** Forward traversal: everything this asset depends on, out to `depth` (-1 = full). */
export function getDependencies(store: GraphStore, ref: string, depth: number): Subgraph | null {
  return traverse(store, ref, depth, "forward");
}

/** Backward traversal: everything that references this asset (impact analysis). */
export function findReferences(store: GraphStore, ref: string, depth: number): Subgraph | null {
  return traverse(store, ref, depth, "backward");
}

function traverse(
  store: GraphStore,
  ref: string,
  depth: number,
  direction: "forward" | "backward",
): Subgraph | null {
  const root = resolveRef(store, ref).node;
  if (!root) return null;

  const nodes = new Map<string, SubgraphNode>([[root.guid, { ...root, distance: 0 }]]);
  const edges: Edge[] = [];
  const queue: string[] = [root.guid];

  while (queue.length > 0) {
    const guid = queue.shift()!;
    const d = nodes.get(guid)!.distance;
    if (depth >= 0 && d >= depth) continue;

    const stepEdges = direction === "forward" ? store.outgoingEdges(guid) : store.incomingEdges(guid);
    for (const e of stepEdges) {
      edges.push(e);
      const nextGuid = direction === "forward" ? e.toGuid : e.fromGuid;
      if (nodes.has(nextGuid)) continue;
      const nextNode = store.getNode(nextGuid);
      if (!nextNode) continue; // edge targets are always nodes, but stay defensive
      nodes.set(nextGuid, { ...nextNode, distance: d + 1 });
      queue.push(nextGuid);
    }
  }

  return { root, nodes: [...nodes.values()], edges };
}
