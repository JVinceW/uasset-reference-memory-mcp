import { describe, expect, test } from "vitest";
import { GraphStore } from "../store/graph-store.js";
import { searchAssets, getOverview } from "./search.js";
import type { AssetNode, AssetType, Edge, Origin } from "../indexer/types.js";

const g = (c: string) => c.repeat(32);
function node(guid: string, path: string, assetType: AssetType, origin: Origin = "project"): AssetNode {
  return {
    guid, path, name: path.slice(path.lastIndexOf("/") + 1),
    assetType, origin, packageId: origin === "package" ? "com.x@1" : null,
    fileSize: 1, mtime: 1, isBinary: false,
  };
}
function edge(fromGuid: string, toGuid: string): Edge {
  return { fromGuid, toGuid, refKind: "SERIALIZED_REF", fileId: null, context: "r", count: 1 };
}

// P1,P2 -> body.mat -> skin.png ; inbound: body.mat=2, skin.png=1
function buildStore(): GraphStore {
  const store = GraphStore.open(":memory:");
  store.upsertNodes([
    node(g("1"), "Assets/UI/P1.prefab", "Prefab"),
    node(g("2"), "Assets/UI/P2.prefab", "Prefab"),
    node(g("b"), "Assets/Mat/body.mat", "Material"),
    node(g("c"), "Assets/Tex/skin.png", "Texture"),
    node(g("p"), "Packages/x/Vendor.mat", "Material", "package"),
  ]);
  store.insertEdges([edge(g("1"), g("b")), edge(g("2"), g("b")), edge(g("b"), g("c"))]);
  store.insertUnresolved([{ fromGuid: g("b"), toGuid: g("9"), context: "m_Shader" }]);
  return store;
}
const names = (a: AssetNode[]) => a.map((n) => n.name).sort();

describe("searchAssets", () => {
  test("filters by type, name substring, path prefix, and origin", () => {
    const store = buildStore();
    expect(names(searchAssets(store, { type: "Prefab" }))).toEqual(["P1.prefab", "P2.prefab"]);
    expect(names(searchAssets(store, { name: "body" }))).toEqual(["body.mat"]);
    expect(names(searchAssets(store, { pathPrefix: "Assets/Tex/" }))).toEqual(["skin.png"]);
    expect(names(searchAssets(store, { origin: "package" }))).toEqual(["Vendor.mat"]);
    store.close();
  });

  test("filters by inbound reference count", () => {
    const store = buildStore();
    expect(names(searchAssets(store, { minRefs: 2 }))).toEqual(["body.mat"]);
    expect(searchAssets(store, { maxRefs: 0 }).some((n) => n.name === "P1.prefab")).toBe(true);
    store.close();
  });
});

describe("getOverview", () => {
  test("summarizes counts, hubs, and broken refs", () => {
    const store = buildStore();
    const o = getOverview(store);
    expect(o.totalAssets).toBe(5);
    expect(o.byType.Prefab).toBe(2);
    expect(o.byOrigin.project).toBe(4);
    expect(o.byOrigin.package).toBe(1);
    expect(o.edgeCount).toBe(3);
    expect(o.unresolvedCount).toBe(1);
    expect(o.brokenRefGuids).toBe(1);
    expect(o.topReferenced[0]).toMatchObject({ name: "body.mat", refCount: 2 });
    store.close();
  });
});
