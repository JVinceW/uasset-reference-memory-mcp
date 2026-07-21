import { describe, expect, test } from "vitest";
import type { AssetNode, AssetType, Edge } from "../indexer/types.js";
import { GraphStore } from "../store/graph-store.js";
import { findReachableGuids } from "./reachability.js";

const guid = (character: string) => character.repeat(32);

const SCENE = guid("1");
const SCENE_PREFAB = guid("2");
const RESOURCE = guid("3");
const ADDRESSABLE = guid("4");
const ADDRESSABLE_MATERIAL = guid("5");

function node(id: string, path: string, assetType: AssetType): AssetNode {
  return {
    guid: id,
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
  return { fromGuid, toGuid, refKind: "SERIALIZED_REF", fileId: null, context: null, count: 1 };
}

describe("findReachableGuids", () => {
  test("uses an explicitly resolved root and its dependency closure", () => {
    const store = GraphStore.open(":memory:");
    store.upsertNodes([
      node(SCENE, "Assets/Main.unity", "Scene"),
      node(ADDRESSABLE, "Assets/UI/Profile.prefab", "Prefab"),
      node(ADDRESSABLE_MATERIAL, "Assets/UI/Profile.mat", "Material"),
    ]);
    store.insertEdges([edge(ADDRESSABLE, ADDRESSABLE_MATERIAL)]);

    expect(
      findReachableGuids(store, { roots: ["Assets/UI/Profile.prefab"], includeAddressables: false }),
    ).toEqual(new Set([ADDRESSABLE, ADDRESSABLE_MATERIAL]));
    store.close();
  });

  test("optionally includes Addressable roots and their dependency closure", () => {
    const store = GraphStore.open(":memory:");
    store.upsertNodes([
      node(SCENE, "Assets/Main.unity", "Scene"),
      node(SCENE_PREFAB, "Assets/Scene.prefab", "Prefab"),
      node(RESOURCE, "Assets/Resources/Config.asset", "ScriptableObject"),
      node(ADDRESSABLE, "Assets/UI/Profile.prefab", "Prefab"),
      node(ADDRESSABLE_MATERIAL, "Assets/UI/Profile.mat", "Material"),
      node(guid("6"), "Assets/Orphan.png", "Texture"),
    ]);
    store.insertEdges([
      edge(SCENE, SCENE_PREFAB),
      edge(ADDRESSABLE, ADDRESSABLE_MATERIAL),
    ]);
    store.replaceAddressableGroups([
      {
        groupGuid: guid("7"),
        assetGuid: guid("8"),
        name: "UI",
        path: "Assets/AddressableAssetsData/AssetGroups/UI.asset",
        entries: [{ guid: ADDRESSABLE, address: "ui/profile", readOnly: false, labels: [] }],
      },
    ]);

    expect(findReachableGuids(store, { includeAddressables: false })).toEqual(
      new Set([SCENE, SCENE_PREFAB, RESOURCE]),
    );
    expect(findReachableGuids(store, { includeAddressables: true })).toEqual(
      new Set([SCENE, SCENE_PREFAB, RESOURCE, ADDRESSABLE, ADDRESSABLE_MATERIAL]),
    );
    store.close();
  });
});
