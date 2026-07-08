import { describe, expect, test } from "vitest";
import { GraphStore } from "../store/graph-store.js";
import { resolveRef, getDependencies, findReferences } from "./traverse.js";
import type { AssetNode, AssetType, Edge } from "../indexer/types.js";

const g = (c: string) => c.repeat(32);

function node(guid: string, path: string, assetType: AssetType = "Prefab"): AssetNode {
  return {
    guid,
    path,
    name: path.slice(path.lastIndexOf("/") + 1),
    assetType,
    origin: "project",
    packageId: null,
    fileSize: 10,
    mtime: 1,
    isBinary: false,
  };
}
function edge(fromGuid: string, toGuid: string): Edge {
  return { fromGuid, toGuid, refKind: "SERIALIZED_REF", fileId: null, context: "r", count: 1 };
}

// A -> B -> C ; A -> D ; plus two assets sharing the name "dup.mat"
function buildStore(): GraphStore {
  const store = GraphStore.open(":memory:");
  store.upsertNodes([
    node(g("a"), "Assets/A.prefab"),
    node(g("b"), "Assets/B.mat", "Material"),
    node(g("c"), "Assets/C.png", "Texture"),
    node(g("d"), "Assets/D.cs", "Script"),
    node(g("1"), "Assets/x/dup.mat", "Material"),
    node(g("2"), "Assets/y/dup.mat", "Material"),
  ]);
  store.insertEdges([edge(g("a"), g("b")), edge(g("b"), g("c")), edge(g("a"), g("d"))]);
  return store;
}

const dist = (sub: { nodes: (AssetNode & { distance: number })[] }) =>
  new Map(sub.nodes.map((n) => [n.name, n.distance]));

describe("resolveRef", () => {
  test("resolves by exact guid, then path, then unique name", () => {
    const store = buildStore();
    expect(resolveRef(store, g("a")).node?.path).toBe("Assets/A.prefab");
    expect(resolveRef(store, "Assets/B.mat").node?.guid).toBe(g("b"));
    expect(resolveRef(store, "A.prefab").node?.guid).toBe(g("a"));
    store.close();
  });

  test("reports ambiguous names and not-found", () => {
    const store = buildStore();
    const amb = resolveRef(store, "dup.mat");
    expect(amb.node).toBeNull();
    expect(amb.reason).toBe("ambiguous");
    expect(amb.candidates).toHaveLength(2);

    const miss = resolveRef(store, "nope.prefab");
    expect(miss.node).toBeNull();
    expect(miss.reason).toBe("not-found");
    store.close();
  });
});

describe("getDependencies (forward)", () => {
  test("full closure returns all reachable dependencies with distances", () => {
    const store = buildStore();
    const sub = getDependencies(store, "Assets/A.prefab", -1)!;
    expect(dist(sub)).toEqual(
      new Map([["A.prefab", 0], ["B.mat", 1], ["C.png", 2], ["D.cs", 1]]),
    );
    expect(sub.edges).toHaveLength(3);
    store.close();
  });

  test("depth bounds the traversal", () => {
    const store = buildStore();
    const sub = getDependencies(store, "Assets/A.prefab", 1)!;
    expect([...dist(sub).keys()].sort()).toEqual(["A.prefab", "B.mat", "D.cs"]);
    expect(sub.edges).toHaveLength(2); // A->B, A->D (not B->C)
    store.close();
  });

  test("returns null for an unresolved ref", () => {
    const store = buildStore();
    expect(getDependencies(store, "nope", -1)).toBeNull();
    store.close();
  });
});

describe("findReferences (backward)", () => {
  test("returns dependents up the chain (impact analysis)", () => {
    const store = buildStore();
    const sub = findReferences(store, "Assets/C.png", -1)!;
    expect(dist(sub)).toEqual(new Map([["C.png", 0], ["B.mat", 1], ["A.prefab", 2]]));
    expect(sub.edges).toHaveLength(2);
    store.close();
  });

  test("depth bounds the dependents", () => {
    const store = buildStore();
    const sub = findReferences(store, "Assets/B.mat", 1)!;
    expect([...dist(sub).keys()].sort()).toEqual(["A.prefab", "B.mat"]);
    store.close();
  });
});
