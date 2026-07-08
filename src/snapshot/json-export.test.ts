import { describe, expect, test } from "vitest";
import { GraphStore } from "../store/graph-store.js";
import { exportGraphJson } from "./json-export.js";
import type { AssetNode, Edge } from "../indexer/types.js";

const g = (c: string) => c.repeat(32);
function node(guid: string, path: string): AssetNode {
  return { guid, path, name: path.slice(path.lastIndexOf("/") + 1), assetType: "Prefab", origin: "project", packageId: null, fileSize: 3, mtime: 1, isBinary: false };
}
function edge(from: string, to: string, context: string): Edge {
  return { fromGuid: from, toGuid: to, refKind: "USES_MATERIAL", fileId: "1", context, count: 1 };
}

function buildStore(): GraphStore {
  const store = GraphStore.open(":memory:");
  // insert out of path order to prove stable sorting
  store.upsertNodes([node(g("b"), "Assets/B.prefab"), node(g("a"), "Assets/A.mat")]);
  store.insertEdges([edge(g("b"), g("a"), "m_Materials")]);
  store.insertUnresolved([{ fromGuid: g("b"), toGuid: g("z"), context: "m_Script" }]);
  store.insertAddressableEntries([{ guid: g("a"), address: "MyMat" }]);
  store.setMeta("indexed_at", "2026-07-08T00:00:00.000Z");
  return store;
}

describe("exportGraphJson", () => {
  test("emits meta with counts and schema version", () => {
    const store = buildStore();
    const j = exportGraphJson(store);
    expect(j.meta).toMatchObject({
      schemaVersion: 2,
      indexedAt: "2026-07-08T00:00:00.000Z",
      assetCount: 2,
      edgeCount: 1,
      unresolvedCount: 1,
      addressableCount: 1,
    });
    store.close();
  });

  test("assets sorted by path with the documented fields", () => {
    const store = buildStore();
    const j = exportGraphJson(store);
    expect(j.assets.map((a) => a.path)).toEqual(["Assets/A.mat", "Assets/B.prefab"]);
    expect(j.assets[0]).toMatchObject({ guid: g("a"), path: "Assets/A.mat", assetType: "Prefab", origin: "project" });
    store.close();
  });

  test("edges use readable paths and are stably ordered", () => {
    const store = buildStore();
    const j = exportGraphJson(store);
    expect(j.edges).toEqual([
      { from: "Assets/B.prefab", to: "Assets/A.mat", refKind: "USES_MATERIAL", context: "m_Materials", fileId: "1", count: 1 },
    ]);
    store.close();
  });

  test("includes unresolved and addressables", () => {
    const store = buildStore();
    const j = exportGraphJson(store);
    expect(j.unresolved).toEqual([{ from: "Assets/B.prefab", toGuid: g("z"), context: "m_Script" }]);
    expect(j.addressables).toEqual([{ guid: g("a"), address: "MyMat" }]);
    store.close();
  });

  test("is deterministic (same store -> identical JSON)", () => {
    const store = buildStore();
    expect(JSON.stringify(exportGraphJson(store))).toBe(JSON.stringify(exportGraphJson(store)));
    store.close();
  });
});
