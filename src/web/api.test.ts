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
  store.setMeta("project_root", "/fixture/project");
  store.setMeta("indexed_at", "2026-08-03T00:00:00.000Z");
  store.upsertNodes([
    node(g("a"), "Assets/A.prefab"),
    node(g("b"), "Assets/B.mat", "Material"),
    node(g("c"), "Assets/C.png", "Texture"),
    { ...node(g("d"), "Packages/pkg/D.prefab"), origin: "package", packageId: "pkg" },
  ]);
  store.insertEdges([edge(g("a"), g("b")), edge(g("b"), g("c"))]);
  store.insertUnresolved([{ fromGuid: g("a"), toGuid: g("z"), context: "m_MissingMaterial" }]);
  return store;
}

describe("handleApi", () => {
  test("GET /api/overview returns summary counts", () => {
    const store = buildStore();
    const res = handleApi(store, "/api/overview", {});
    expect(res.status).toBe(200);
    expect((res.body as { totalAssets: number }).totalAssets).toBe(4);
    store.close();
  });

  test("GET /api/index-status returns stored metadata without scanning", () => {
    const store = buildStore();
    const res = handleApi(store, "/api/index-status", {});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      projectRoot: "/fixture/project",
      indexedAt: "2026-08-03T00:00:00.000Z",
      assetCount: 4,
      edgeCount: 2,
      unresolvedCount: 1,
      expectedSchemaVersion: 3,
    });
    store.close();
  });

  test("GET /api/search filters by type and matches path or guid prefix", () => {
    const store = buildStore();
    const byType = handleApi(store, "/api/search", { type: "Material" });
    expect(byType.status).toBe(200);
    expect((byType.body as { name: string }[]).map((n) => n.name)).toEqual(["B.mat"]);

    const byPath = handleApi(store, "/api/search", { name: "Assets/C" });
    expect((byPath.body as { name: string }[]).map((n) => n.name)).toEqual(["C.png"]);

    const byGuid = handleApi(store, "/api/search", { name: g("b").slice(0, 8) });
    expect((byGuid.body as { name: string }[]).map((n) => n.name)).toEqual(["B.mat"]);
    store.close();
  });

  test("GET /api/asset-detail returns selected asset and reference rows", () => {
    const store = buildStore();
    const res = handleApi(store, "/api/asset-detail", { ref: "Assets/B.mat" });
    expect(res.status).toBe(200);
    const body = res.body as {
      asset: { name: string };
      inbound: unknown[];
      outbound: unknown[];
      inboundCount: number;
      outboundCount: number;
    };
    expect(body.asset.name).toBe("B.mat");
    expect(body.inbound).toHaveLength(1);
    expect(body.outbound).toHaveLength(1);
    expect(body.inboundCount).toBe(1);
    expect(body.outboundCount).toBe(1);
    store.close();
  });

  test("GET /api/graph returns a budgeted graph with filters", () => {
    const store = buildStore();
    const res = handleApi(store, "/api/graph", { origins: "project", limit: "2" });
    expect(res.status).toBe(200);
    const body = res.body as {
      nodes: { data: { origin: string; degree: number } }[];
      edges: unknown[];
      totalCandidates: number;
      truncated: boolean;
    };
    expect(body.nodes).toHaveLength(2);
    expect(body.nodes.every((node) => node.data.origin === "project")).toBe(true);
    expect(body.nodes[0]!.data.degree).toBeGreaterThanOrEqual(body.nodes[1]!.data.degree);
    expect(body.totalCandidates).toBe(3);
    expect(body.truncated).toBe(true);
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

  test("GET /api/root-trace returns a capped inbound or outbound closure", () => {
    const store = buildStore();
    const deps = handleApi(store, "/api/root-trace", { ref: "Assets/A.prefab", dir: "deps", depth: "2" });
    expect(deps.status).toBe(200);
    expect((deps.body as { nodes: unknown[]; edges: unknown[]; byDistance: Record<string, number> })).toMatchObject({
      byDistance: { "0": 1, "1": 1, "2": 1 },
    });

    const refs = handleApi(store, "/api/root-trace", { ref: "Assets/C.png", dir: "refs", depth: "2", limit: "2" });
    expect(refs.status).toBe(200);
    const body = refs.body as { nodes: unknown[]; truncated: boolean };
    expect(body.nodes).toHaveLength(2);
    expect(body.truncated).toBe(true);
    store.close();
  });

  test("GET /api/root-trace 404s on an unresolved ref", () => {
    const store = buildStore();
    const res = handleApi(store, "/api/root-trace", { ref: "nope", dir: "deps" });
    expect(res.status).toBe(404);
    store.close();
  });

  test("GET /api/broken-references returns source asset and missing target context", () => {
    const store = buildStore();
    const res = handleApi(store, "/api/broken-references", { limit: "10" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        fromGuid: g("a"),
        fromPath: "Assets/A.prefab",
        fromName: "A.prefab",
        fromType: "Prefab",
        fromOrigin: "project",
        toGuid: g("z"),
        context: "m_MissingMaterial",
        count: 1,
      },
    ]);
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
