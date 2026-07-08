import { describe, expect, test } from "vitest";
import { GraphStore } from "../store/graph-store.js";
import { handleApi } from "./api.js";
import type { AssetNode, AssetType, Edge } from "../indexer/types.js";

const g = (c: string) => c.repeat(32);
function node(guid: string, path: string, assetType: AssetType = "Prefab"): AssetNode {
  return {
    guid, path, name: path.slice(path.lastIndexOf("/") + 1),
    assetType, origin: "project", packageId: null, fileSize: 1, mtime: 1, isBinary: false,
  };
}
function edge(fromGuid: string, toGuid: string): Edge {
  return { fromGuid, toGuid, refKind: "USES_MATERIAL", fileId: null, context: "m_Materials", count: 1 };
}
function buildStore(): GraphStore {
  const store = GraphStore.open(":memory:");
  store.upsertNodes([
    node(g("a"), "Assets/A.prefab"),
    node(g("b"), "Assets/B.mat", "Material"),
    node(g("c"), "Assets/C.png", "Texture"),
  ]);
  store.insertEdges([edge(g("a"), g("b")), edge(g("b"), g("c"))]);
  return store;
}

describe("handleApi", () => {
  test("GET /api/overview returns summary counts", () => {
    const store = buildStore();
    const res = handleApi(store, "/api/overview", {});
    expect(res.status).toBe(200);
    expect((res.body as { totalAssets: number }).totalAssets).toBe(3);
    store.close();
  });

  test("GET /api/search filters by type", () => {
    const store = buildStore();
    const res = handleApi(store, "/api/search", { type: "Material" });
    expect(res.status).toBe(200);
    expect((res.body as { name: string }[]).map((n) => n.name)).toEqual(["B.mat"]);
    store.close();
  });

  test("GET /api/neighborhood returns Cytoscape elements", () => {
    const store = buildStore();
    const res = handleApi(store, "/api/neighborhood", { ref: "Assets/A.prefab", dir: "deps", depth: "2" });
    expect(res.status).toBe(200);
    const body = res.body as { rootId: string; nodes: unknown[]; edges: { data: { source: string; target: string } }[] };
    expect(body.rootId).toBe(g("a"));
    expect(body.nodes).toHaveLength(3);
    expect(body.edges).toHaveLength(2);
    expect(body.edges[0]!.data).toMatchObject({ source: g("a"), target: g("b") });
    store.close();
  });

  test("GET /api/neighborhood 404s on an unresolved ref", () => {
    const store = buildStore();
    const res = handleApi(store, "/api/neighborhood", { ref: "nope", dir: "deps" });
    expect(res.status).toBe(404);
    store.close();
  });

  test("GET /api/trace returns a path or 404", () => {
    const store = buildStore();
    const ok = handleApi(store, "/api/trace", { from: "Assets/A.prefab", to: "Assets/C.png" });
    expect(ok.status).toBe(200);
    expect((ok.body as { edges: unknown[] }).edges).toHaveLength(2);

    const none = handleApi(store, "/api/trace", { from: "Assets/C.png", to: "Assets/A.prefab" });
    expect(none.status).toBe(404);
    store.close();
  });

  test("unknown route 404s", () => {
    const store = buildStore();
    expect(handleApi(store, "/api/nope", {}).status).toBe(404);
    store.close();
  });
});
