import { describe, expect, test } from "vitest";
import { buildGraphLayout } from "./graphModel";
import { ASSET_TYPES, ORIGINS } from "../state/viewerStore";
import type { AssetType, Neighborhood, Origin } from "../data/apiTypes";

function allEnabled<T extends string>(values: readonly T[]): Record<T, boolean> {
  return Object.fromEntries(values.map((value) => [value, true])) as Record<T, boolean>;
}

const activeTypes = allEnabled<AssetType>(ASSET_TYPES);
const activeOrigins = allEnabled<Origin>(ORIGINS);

function graph(): Neighborhood {
  return {
    rootId: "root",
    nodes: [
      {
        data: {
          id: "root",
          label: "Root.prefab",
          type: "Prefab",
          origin: "project",
          path: "Assets/Root.prefab",
          distance: 0,
          degree: 5,
          inbound: 2,
          outbound: 3,
        },
      },
      {
        data: {
          id: "mat",
          label: "Mat.mat",
          type: "Material",
          origin: "project",
          path: "Assets/Mat.mat",
          distance: 1,
          degree: 2,
          inbound: 1,
          outbound: 1,
        },
      },
      {
        data: {
          id: "builtin",
          label: "Builtin.shader",
          type: "Shader",
          origin: "builtin",
          path: "Resources/unity_builtin_extra",
          distance: 1,
          degree: 1,
          inbound: 1,
          outbound: 0,
        },
      },
    ],
    edges: [
      {
        data: {
          id: "root->mat",
          source: "root",
          target: "mat",
          kind: "yaml",
          context: "m_Material",
          fileId: "2100000",
          count: 2,
        },
      },
      {
        data: {
          id: "root->missing",
          source: "root",
          target: "missing",
          kind: "yaml",
          context: null,
          count: 1,
        },
      },
    ],
  };
}

describe("buildGraphLayout", () => {
  test("keeps the trace root centered and sizes nodes by graph degree", () => {
    const layout = buildGraphLayout(graph(), activeTypes, activeOrigins);

    expect(layout.nodesById.get("root")).toMatchObject({
      isRoot: true,
      x: 0,
      y: 0,
      z: 0,
      degree: 5,
    });
    expect(layout.nodesById.get("root")!.radius).toBeGreaterThan(layout.nodesById.get("mat")!.radius);
  });

  test("filters hidden origins and prunes edges outside the visible node set", () => {
    const origins = { ...activeOrigins, builtin: false };
    const layout = buildGraphLayout(graph(), activeTypes, origins);

    expect(layout.nodes.map((node) => node.id)).toEqual(["root", "mat"]);
    expect(layout.edges.map((edge) => edge.id)).toEqual(["root->mat"]);
  });

  test("uses deterministic overview positions when no root is present", () => {
    const overview = { ...graph(), rootId: "" };
    const first = buildGraphLayout(overview, activeTypes, activeOrigins);
    const second = buildGraphLayout(overview, activeTypes, activeOrigins);

    expect(first.nodes.map(({ id, x, y, z }) => ({ id, x, y, z }))).toEqual(
      second.nodes.map(({ id, x, y, z }) => ({ id, x, y, z })),
    );
  });
});
