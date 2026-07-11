import { describe, expect, test } from "vitest";
import { GraphStore } from "../store/graph-store.js";
import { verifyIndex } from "./verify.js";
import type { AssetNode } from "../indexer/types.js";

const guid = (value: string) => value.repeat(32);

function node(overrides: Partial<AssetNode> & Pick<AssetNode, "guid" | "path">): AssetNode {
  return {
    name: overrides.path.slice(overrides.path.lastIndexOf("/") + 1),
    assetType: "Prefab",
    origin: "project",
    packageId: null,
    fileSize: 1,
    mtime: 1,
    isBinary: false,
    ...overrides,
  };
}

describe("verifyIndex", () => {
  test("reports a Unity dependency that the indexed graph missed", () => {
    const store = GraphStore.open(":memory:");
    store.upsertNodes([
      node({ guid: guid("a"), path: "Assets/Player.prefab" }),
      node({ guid: guid("b"), path: "Assets/Body.mat", assetType: "Material" }),
    ]);

    const report = verifyIndex(store, {
      schemaVersion: 1,
      unityVersion: "2022.3.0f1",
      exportedAt: "2026-07-12T00:00:00.000Z",
      assets: [
        {
          path: "Assets/Player.prefab",
          guid: guid("a"),
          dependencies: [{ path: "Assets/Body.mat", guid: guid("b") }],
        },
      ],
    }, "2026-07-12T00:01:00.000Z");

    expect(report.unityDependencyCount).toBe(1);
    expect(report.matchedCount).toBe(0);
    expect(report.missedEdges).toEqual([
      expect.objectContaining({
        fromGuid: guid("a"),
        toGuid: guid("b"),
        refKind: "USES_MATERIAL",
      }),
    ]);
    store.close();
  });

  test("compares one Unity dependency against duplicate parser reference sites", () => {
    const store = GraphStore.open(":memory:");
    const source = node({ guid: guid("a"), path: "Assets/Player.prefab" });
    const material = node({ guid: guid("b"), path: "Assets/Body.mat", assetType: "Material" });
    const texture = node({ guid: guid("c"), path: "Assets/Body.png", assetType: "Texture" });
    store.upsertNodes([source, material, texture]);
    store.insertEdges([
      { fromGuid: source.guid, toGuid: material.guid, refKind: "USES_MATERIAL", fileId: null, context: "m_Materials", count: 1 },
      { fromGuid: source.guid, toGuid: material.guid, refKind: "USES_MATERIAL", fileId: null, context: "m_SecondaryMaterials", count: 1 },
      { fromGuid: source.guid, toGuid: texture.guid, refKind: "USES_TEXTURE", fileId: null, context: "m_MainTex", count: 1 },
    ]);

    const report = verifyIndex(store, {
      schemaVersion: 1,
      unityVersion: "2022.3.0f1",
      exportedAt: "2026-07-12T00:00:00.000Z",
      assets: [{
        path: source.path,
        guid: source.guid,
        dependencies: [{ path: material.path, guid: material.guid }],
      }],
    }, "2026-07-12T00:01:00.000Z");

    expect(report).toMatchObject({ unityDependencyCount: 1, indexedDependencyCount: 2, matchedCount: 1 });
    expect(report.missedEdges).toEqual([]);
    expect(report.extraEdges).toEqual([expect.objectContaining({ toGuid: texture.guid, refKind: "USES_TEXTURE" })]);
    store.close();
  });

  test("reports exported assets and dependencies absent from the index without throwing", () => {
    const store = GraphStore.open(":memory:");
    store.upsertNodes([node({ guid: guid("a"), path: "Assets/Player.prefab" })]);

    const report = verifyIndex(store, {
      schemaVersion: 1,
      unityVersion: "2022.3.0f1",
      exportedAt: "2026-07-12T00:00:00.000Z",
      assets: [
        { path: "Assets/Deleted.prefab", guid: guid("d"), dependencies: [] },
        { path: "Assets/Player.prefab", guid: guid("a"), dependencies: [{ path: "Assets/Missing.mat", guid: guid("m") }] },
      ],
    }, "2026-07-12T00:01:00.000Z");

    expect(report.unresolvedAssets).toEqual([{ path: "Assets/Deleted.prefab", guid: guid("d") }]);
    expect(report.unresolvedDependencies).toEqual([
      { fromPath: "Assets/Player.prefab", fromGuid: guid("a"), path: "Assets/Missing.mat", guid: guid("m") },
    ]);
    store.close();
  });

  test("uses a dependency GUID when Unity and index package paths differ", () => {
    const store = GraphStore.open(":memory:");
    const source = node({ guid: guid("a"), path: "Assets/Player.prefab" });
    const packageMaterial = node({
      guid: guid("b"),
      path: "Library/PackageCache/com.example.materials@1.0.0/Body.mat",
      assetType: "Material",
      origin: "package",
      packageId: "com.example.materials@1.0.0",
    });
    store.upsertNodes([source, packageMaterial]);
    store.insertEdges([{ fromGuid: source.guid, toGuid: packageMaterial.guid, refKind: "USES_MATERIAL", fileId: null, context: "m_Materials", count: 1 }]);

    const report = verifyIndex(store, {
      schemaVersion: 1,
      unityVersion: "2022.3.0f1",
      exportedAt: "2026-07-12T00:00:00.000Z",
      assets: [{
        path: source.path,
        guid: source.guid,
        dependencies: [{ path: "Packages/com.example.materials/Body.mat", guid: packageMaterial.guid }],
      }],
    }, "2026-07-12T00:01:00.000Z");

    expect(report).toMatchObject({ matchedCount: 1, missedEdges: [], extraEdges: [] });
    store.close();
  });
});
