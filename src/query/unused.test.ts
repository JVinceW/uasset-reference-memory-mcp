import { describe, expect, test } from "vitest";
import { GraphStore } from "../store/graph-store.js";
import { findUnusedAssets } from "./unused.js";
import type { AssetNode, AssetType, Edge, Origin } from "../indexer/types.js";

const g = (c: string) => c.repeat(32);

function node(
  guid: string,
  path: string,
  assetType: AssetType,
  opts: { origin?: Origin; fileSize?: number | null } = {},
): AssetNode {
  return {
    guid,
    path,
    name: path.slice(path.lastIndexOf("/") + 1),
    assetType,
    origin: opts.origin ?? "project",
    packageId: null,
    fileSize: opts.fileSize ?? 10,
    mtime: 1,
    isBinary: false,
  };
}
function edge(fromGuid: string, toGuid: string): Edge {
  return { fromGuid, toGuid, refKind: "SERIALIZED_REF", fileId: null, context: "r", count: 1 };
}

// Scene S -> P -> M -> T (all used). Orphans: O (texture), U (unused big texture).
// R lives under Resources (a root). PKG is package-origin & unreachable. F is a folder.
function buildStore(): GraphStore {
  const store = GraphStore.open(":memory:");
  store.upsertNodes([
    node(g("5"), "Assets/Main.unity", "Scene"),
    node(g("a"), "Assets/P.prefab", "Prefab"),
    node(g("b"), "Assets/M.mat", "Material"),
    node(g("c"), "Assets/T.png", "Texture"),
    node(g("o"), "Assets/lobby/O.png", "Texture", { fileSize: 100 }),
    node(g("u"), "Assets/lobby/U.png", "Texture", { fileSize: 5000 }),
    node(g("r"), "Assets/Resources/R.prefab", "Prefab"),
    node(g("p"), "Assets/Vendor/PKG.png", "Texture", { origin: "package" }),
    node(g("f"), "Assets/lobby", "Folder"),
    node(g("s"), "Assets/Only/Code.cs", "Script"),
  ]);
  store.insertEdges([edge(g("5"), g("a")), edge(g("a"), g("b")), edge(g("b"), g("c"))]);
  return store;
}

const names = (nodes: AssetNode[]) => nodes.map((n) => n.name);

describe("findUnusedAssets", () => {
  test("reports project-origin, reachable-from-roots orphans only", () => {
    const store = buildStore();
    const unused = findUnusedAssets(store);
    const set = new Set(names(unused));
    expect(set.has("O.png")).toBe(true); // orphan
    expect(set.has("U.png")).toBe(true); // orphan
    expect(set.has("T.png")).toBe(false); // reachable via scene
    expect(set.has("R.prefab")).toBe(false); // a Resources root
    expect(set.has("PKG.png")).toBe(false); // package origin excluded
    expect(set.has("lobby")).toBe(false); // folder excluded
    expect(set.has("Code.cs")).toBe(false); // scripts excluded by default
    store.close();
  });

  test("sorts by file_size descending (biggest cleanup wins first)", () => {
    const store = buildStore();
    const unused = findUnusedAssets(store);
    expect(names(unused)).toEqual(["U.png", "O.png"]); // 5000 before 100
    store.close();
  });

  test("scope narrows results to a path prefix", () => {
    const store = buildStore();
    expect(findUnusedAssets(store, { scope: "Assets/lobby/" }).length).toBe(2);
    expect(findUnusedAssets(store, { scope: "Assets/nowhere/" }).length).toBe(0);
    store.close();
  });

  test("includeScripts surfaces unreferenced scripts too", () => {
    const store = buildStore();
    const set = new Set(names(findUnusedAssets(store, { includeScripts: true })));
    expect(set.has("Code.cs")).toBe(true);
    store.close();
  });
});
