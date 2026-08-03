import type { AssetType, CyEdge, Neighborhood, Origin } from "../data/apiTypes";

export interface GraphLayoutNode {
  degree: number;
  distance: number;
  id: string;
  inbound: number;
  isRoot: boolean;
  label: string;
  origin: Origin;
  outbound: number;
  path: string;
  radius: number;
  type: AssetType;
  x: number;
  y: number;
  z: number;
}

export interface GraphLayoutEdge {
  context: string | null;
  count: number;
  fileId: string | null;
  id: string;
  kind: string;
  source: string;
  target: string;
}

export interface GraphLayout {
  edges: GraphLayoutEdge[];
  nodes: GraphLayoutNode[];
  nodesById: Map<string, GraphLayoutNode>;
  sceneRadius: number;
}

export function buildGraphLayout(
  graph: Neighborhood | undefined,
  activeTypes: Record<AssetType, boolean>,
  activeOrigins: Record<Origin, boolean>,
): GraphLayout {
  if (!graph) return emptyLayout();

  const visible = graph.nodes
    .filter((node) => activeTypes[node.data.type] && activeOrigins[node.data.origin])
    .sort((a, b) => {
      if (a.data.id === graph.rootId) return -1;
      if (b.data.id === graph.rootId) return 1;
      return a.data.distance - b.data.distance || a.data.label.localeCompare(b.data.label) || a.data.id.localeCompare(b.data.id);
    });
  const nodes = graph.rootId
    ? layoutTraceNodes(visible, graph.rootId)
    : layoutOverviewNodes(visible);
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const edges = graph.edges
    .filter((edge) => nodesById.has(edge.data.source) && nodesById.has(edge.data.target))
    .map(toLayoutEdge);

  return {
    edges,
    nodes,
    nodesById,
    sceneRadius: Math.max(120, Math.sqrt(Math.max(1, nodes.length)) * 24),
  };
}

function layoutOverviewNodes(nodes: Neighborhood["nodes"]): GraphLayoutNode[] {
  const count = Math.max(1, nodes.length);
  const spread = Math.max(120, Math.sqrt(count) * 23);

  return nodes.map((node, index) => {
    const point = fibonacciSphere(index, count);
    const degree = node.data.degree ?? (node.data.inbound ?? 0) + (node.data.outbound ?? 0);
    const weight = 0.72 + Math.min(0.48, Math.log2(degree + 1) / 16);
    return toLayoutNode(node, false, {
      x: point.x * spread * weight,
      y: point.y * spread * weight,
      z: point.z * spread * weight,
    });
  });
}

function layoutTraceNodes(nodes: Neighborhood["nodes"], rootId: string): GraphLayoutNode[] {
  const grouped = new Map<number, Neighborhood["nodes"]>();
  for (const node of nodes) {
    const distance = Math.max(0, node.data.distance ?? 0);
    grouped.set(distance, [...(grouped.get(distance) ?? []), node]);
  }

  const result: GraphLayoutNode[] = [];
  for (const [distance, group] of [...grouped.entries()].sort((a, b) => a[0] - b[0])) {
    const sorted = [...group].sort((a, b) => a.data.label.localeCompare(b.data.label) || a.data.id.localeCompare(b.data.id));
    if (distance === 0) {
      for (const node of sorted) result.push(toLayoutNode(node, node.data.id === rootId, { x: 0, y: 0, z: 0 }));
      continue;
    }

    const shellRadius = 76 + distance * 86;
    sorted.forEach((node, index) => {
      const point = fibonacciSphere(index, sorted.length);
      result.push(
        toLayoutNode(node, node.data.id === rootId, {
          x: point.x * shellRadius,
          y: point.y * shellRadius,
          z: point.z * shellRadius,
        }),
      );
    });
  }
  return result;
}

function toLayoutNode(
  node: Neighborhood["nodes"][number],
  isRoot: boolean,
  position: { x: number; y: number; z: number },
): GraphLayoutNode {
  const inbound = node.data.inbound ?? 0;
  const outbound = node.data.outbound ?? 0;
  const degree = node.data.degree ?? inbound + outbound;
  return {
    degree,
    distance: node.data.distance ?? 0,
    id: node.data.id,
    inbound,
    isRoot,
    label: node.data.label,
    origin: node.data.origin,
    outbound,
    path: node.data.path,
    radius: isRoot ? 8.5 : 3.8 + Math.min(6.2, Math.log2(degree + 1) * 1.15),
    type: node.data.type,
    ...position,
  };
}

function toLayoutEdge(edge: CyEdge): GraphLayoutEdge {
  return {
    context: edge.data.context,
    count: edge.data.count ?? 1,
    fileId: edge.data.fileId ?? null,
    id: edge.data.id,
    kind: edge.data.kind,
    source: edge.data.source,
    target: edge.data.target,
  };
}

function fibonacciSphere(index: number, count: number): { x: number; y: number; z: number } {
  if (count <= 1) return { x: 0, y: 0, z: 0 };
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - (index / (count - 1)) * 2;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = goldenAngle * index;
  return {
    x: Math.cos(theta) * radius,
    y,
    z: Math.sin(theta) * radius,
  };
}

function emptyLayout(): GraphLayout {
  return { edges: [], nodes: [], nodesById: new Map(), sceneRadius: 120 };
}
