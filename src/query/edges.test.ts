import { describe, expect, test } from "vitest";
import { GraphStore } from "../store/graph-store.js";
import { getEdges } from "./edges.js";
import type { AssetNode, Edge, RefKind } from "../indexer/types.js";

const g = (c: string) => c.repeat(32);
function node(guid: string, path: string): AssetNode {
  return { guid, path, name: path.slice(path.lastIndexOf("/") + 1), assetType: "Prefab", origin: "project", packageId: null, fileSize: 1, mtime: 1, isBinary: false };
}
function edge(from: string, to: string, refKind: RefKind, context: string, fileId: string | null): Edge {
  return { fromGuid: from, toGuid: to, refKind, fileId, context, count: 1 };
}

// Map -> Deco via 3 distinct reference sites; Map -> Other once.
function buildStore(): GraphStore {
  const store = GraphStore.open(":memory:");
  store.upsertNodes([
    node(g("a"), "Assets/Map.prefab"),
    node(g("b"), "Assets/Deco.prefab"),
    node(g("c"), "Assets/Other.mat"),
  ]);
  store.insertEdges([
    edge(g("a"), g("b"), "NESTED_PREFAB", "m_SourcePrefab", "111"),
    edge(g("a"), g("b"), "NESTED_PREFAB", "m_CorrespondingSourceObject", "222"),
    edge(g("a"), g("b"), "SERIALIZED_REF", "m_Modification", "333"),
    edge(g("a"), g("c"), "USES_MATERIAL", "m_Materials", "444"),
  ]);
  return store;
}

describe("getEdges", () => {
  test("lists individual edges between two assets with context, kind, fileId", () => {
    const store = buildStore();
    const edges = getEdges(store, { from: "Assets/Map.prefab", to: "Assets/Deco.prefab" });
    expect(edges).toHaveLength(3);
    expect(edges.map((e) => e.context).sort()).toEqual(
      ["m_CorrespondingSourceObject", "m_Modification", "m_SourcePrefab"],
    );
    expect(edges[0]).toMatchObject({ from: "Assets/Map.prefab", to: "Assets/Deco.prefab" });
    expect(edges.every((e) => e.fileId !== null)).toBe(true);
  });

  test("lists all edges pointing at an asset (to only)", () => {
    const store = buildStore();
    expect(getEdges(store, { to: "Assets/Deco.prefab" })).toHaveLength(3);
    expect(getEdges(store, { to: "Assets/Other.mat" })).toHaveLength(1);
  });

  test("lists all edges from an asset (from only)", () => {
    const store = buildStore();
    expect(getEdges(store, { from: "Assets/Map.prefab" })).toHaveLength(4);
  });

  test("filters by ref kind", () => {
    const store = buildStore();
    const nested = getEdges(store, { from: "Assets/Map.prefab", kind: "NESTED_PREFAB" });
    expect(nested).toHaveLength(2);
  });

  test("returns [] when an endpoint does not resolve", () => {
    const store = buildStore();
    expect(getEdges(store, { from: "nope" })).toEqual([]);
  });
});
