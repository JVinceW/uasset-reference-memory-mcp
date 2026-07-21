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
  store.replaceAddressableGroups([
    {
      groupGuid: g("d"),
      assetGuid: g("f"),
      name: "UI Remote",
      path: "Assets/AddressableAssetsData/AssetGroups/UI.asset",
      entries: [{ guid: g("a"), address: "ui/profile", readOnly: false, labels: ["ui", "remote"] }],
    },
    {
      groupGuid: g("1"),
      assetGuid: g("4"),
      name: "Alpha",
      path: "Assets/AddressableAssetsData/AssetGroups/Z.asset",
      entries: [
        { guid: g("e"), address: "shared", readOnly: false, labels: [] },
        { guid: g("c"), address: "shared", readOnly: true, labels: [] },
      ],
    },
    {
      groupGuid: g("2"),
      assetGuid: g("5"),
      name: "Zed",
      path: "Assets/AddressableAssetsData/AssetGroups/First.asset",
      entries: [{ guid: g("0"), address: "a/first", readOnly: false, labels: [] }],
    },
    {
      groupGuid: g("3"),
      assetGuid: g("6"),
      name: "Alpha",
      path: "Assets/AddressableAssetsData/AssetGroups/A.asset",
      entries: [{ guid: g("b"), address: "shared", readOnly: false, labels: ["z", "a"] }],
    },
  ]);
  store.setMeta("indexed_at", "2026-07-08T00:00:00.000Z");
  return store;
}

describe("exportGraphJson", () => {
  test("emits meta with counts and schema version", () => {
    const store = buildStore();
    const j = exportGraphJson(store);
    expect(j.meta).toMatchObject({
      schemaVersion: 3,
      indexedAt: "2026-07-08T00:00:00.000Z",
      assetCount: 2,
      edgeCount: 1,
      unresolvedCount: 1,
      addressableCount: 5,
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

  test("includes unresolved and orders addressables by address, group, path, and GUID", () => {
    const store = buildStore();
    const j = exportGraphJson(store);
    expect(j.unresolved).toEqual([{ from: "Assets/B.prefab", toGuid: g("z"), context: "m_Script" }]);
    expect(j.addressables.map((entry) => [
      entry.address,
      entry.group.name,
      entry.group.path,
      entry.guid,
    ])).toEqual([
      ["a/first", "Zed", "Assets/AddressableAssetsData/AssetGroups/First.asset", g("0")],
      ["shared", "Alpha", "Assets/AddressableAssetsData/AssetGroups/A.asset", g("b")],
      ["shared", "Alpha", "Assets/AddressableAssetsData/AssetGroups/Z.asset", g("c")],
      ["shared", "Alpha", "Assets/AddressableAssetsData/AssetGroups/Z.asset", g("e")],
      ["ui/profile", "UI Remote", "Assets/AddressableAssetsData/AssetGroups/UI.asset", g("a")],
    ]);
    expect(j.addressables.find((entry) => entry.guid === g("a"))).toEqual(
      {
        guid: g("a"),
        address: "ui/profile",
        readOnly: false,
        group: {
          guid: g("d"),
          assetGuid: g("f"),
          name: "UI Remote",
          path: "Assets/AddressableAssetsData/AssetGroups/UI.asset",
        },
        labels: ["remote", "ui"],
      },
    );
    expect(j.addressables.find((entry) => entry.guid === g("b"))?.labels).toEqual(["a", "z"]);
    store.close();
  });

  test("is deterministic (same store -> identical JSON)", () => {
    const store = buildStore();
    expect(JSON.stringify(exportGraphJson(store))).toBe(JSON.stringify(exportGraphJson(store)));
    store.close();
  });
});
