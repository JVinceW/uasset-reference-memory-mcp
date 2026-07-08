import { describe, expect, test } from "vitest";
import { GraphStore } from "../store/graph-store.js";
import { tracePath } from "./trace.js";
import type { AssetNode, Edge } from "../indexer/types.js";

const g = (c: string) => c.repeat(32);
function node(guid: string, path: string): AssetNode {
  return {
    guid, path, name: path.slice(path.lastIndexOf("/") + 1),
    assetType: "Prefab", origin: "project", packageId: null,
    fileSize: 1, mtime: 1, isBinary: false,
  };
}
function edge(fromGuid: string, toGuid: string): Edge {
  return { fromGuid, toGuid, refKind: "SERIALIZED_REF", fileId: null, context: "r", count: 1 };
}

// A -> B -> C ; A -> D ; C -> E ; D -> E  (two paths A..E, shortest is length 2)
function buildStore(): GraphStore {
  const store = GraphStore.open(":memory:");
  store.upsertNodes(["a", "b", "c", "d", "e"].map((c) => node(g(c), `Assets/${c.toUpperCase()}.prefab`)));
  store.insertEdges([
    edge(g("a"), g("b")), edge(g("b"), g("c")),
    edge(g("a"), g("d")), edge(g("c"), g("e")), edge(g("d"), g("e")),
  ]);
  return store;
}

const pathNames = (r: { nodes: AssetNode[] }) => r.nodes.map((n) => n.name);

describe("tracePath", () => {
  test("returns the reference chain between two assets", () => {
    const store = buildStore();
    const r = tracePath(store, "Assets/A.prefab", "Assets/C.prefab")!;
    expect(pathNames(r)).toEqual(["A.prefab", "B.prefab", "C.prefab"]);
    expect(r.edges).toHaveLength(2);
    store.close();
  });

  test("returns the shortest chain when several exist", () => {
    const store = buildStore();
    const r = tracePath(store, "Assets/A.prefab", "Assets/E.prefab")!;
    expect(r.edges).toHaveLength(2); // A->D->E (len 2), not A->B->C->E (len 3)
    expect(pathNames(r)[0]).toBe("A.prefab");
    expect(pathNames(r).at(-1)).toBe("E.prefab");
    store.close();
  });

  test("trivial path when from equals to", () => {
    const store = buildStore();
    const r = tracePath(store, "Assets/A.prefab", "Assets/A.prefab")!;
    expect(pathNames(r)).toEqual(["A.prefab"]);
    expect(r.edges).toHaveLength(0);
    store.close();
  });

  test("null when no forward path exists or a ref is unresolved", () => {
    const store = buildStore();
    expect(tracePath(store, "Assets/C.prefab", "Assets/A.prefab")).toBeNull();
    expect(tracePath(store, "nope", "Assets/A.prefab")).toBeNull();
    store.close();
  });
});
