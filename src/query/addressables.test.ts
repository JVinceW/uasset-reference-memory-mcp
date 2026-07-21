import { describe, expect, test } from "vitest";
import type { AssetNode, AssetType, Edge } from "../indexer/types.js";
import type { AddressableGroup } from "../indexer/addressables.js";
import { GraphStore } from "../store/graph-store.js";
import {
  getAddressableInfo,
  listAddressableGroups,
  searchAddressables,
} from "./addressables.js";

const guid = (value: number) => value.toString(16).padStart(32, "0");
const SCENE = guid(1);
const LOCAL = guid(2);
const PROFILE = guid(3);
const PROFILE_MATERIAL = guid(4);
const SHARED = guid(5);
const DUPLICATE_A = guid(6);
const DUPLICATE_B = guid(7);
const UI_GROUP = guid(8);
const CORE_GROUP = guid(9);

function node(id: string, path: string, type: AssetType, fileSize = 10): AssetNode {
  return {
    guid: id,
    path,
    name: path.slice(path.lastIndexOf("/") + 1),
    assetType: type,
    origin: "project",
    packageId: null,
    fileSize,
    mtime: 1,
    isBinary: false,
  };
}

function edge(fromGuid: string, toGuid: string): Edge {
  return { fromGuid, toGuid, refKind: "SERIALIZED_REF", fileId: null, context: null, count: 1 };
}

function buildStore(): GraphStore {
  const store = GraphStore.open(":memory:");
  store.upsertNodes([
    node(SCENE, "Assets/Main.unity", "Scene"),
    node(LOCAL, "Assets/UI/Local.prefab", "Prefab"),
    node(PROFILE, "Assets/UI/Profile.prefab", "Prefab", 100),
    node(PROFILE_MATERIAL, "Assets/UI/Profile.mat", "Material", 30),
    node(SHARED, "Assets/Common/Shared.asset", "ScriptableObject", 50),
    node(DUPLICATE_A, "Assets/A/Duplicate.prefab", "Prefab", 20),
    node(DUPLICATE_B, "Assets/B/Duplicate.prefab", "Prefab", 40),
  ]);
  store.insertEdges([edge(SCENE, LOCAL), edge(SCENE, SHARED), edge(PROFILE, PROFILE_MATERIAL)]);
  store.replaceAddressableGroups([
    {
      groupGuid: UI_GROUP,
      assetGuid: guid(10),
      name: "UI Remote",
      path: "Assets/AddressableAssetsData/AssetGroups/UI.asset",
      entries: [
        { guid: PROFILE, address: "ui/profile", readOnly: false, labels: ["ui", "remote"] },
        { guid: DUPLICATE_A, address: "duplicate/address", readOnly: true, labels: ["remote"] },
      ],
    },
    {
      groupGuid: CORE_GROUP,
      assetGuid: guid(11),
      name: "Core Local",
      path: "Assets/AddressableAssetsData/AssetGroups/Core.asset",
      entries: [
        { guid: SHARED, address: "core/shared", readOnly: false, labels: ["ui", "local"] },
        { guid: DUPLICATE_B, address: "duplicate/address", readOnly: false, labels: ["remote"] },
      ],
    },
  ]);
  return store;
}

describe("getAddressableInfo", () => {
  test("returns metadata, reference counts, and the Addressables-only review signal", () => {
    const store = buildStore();
    expect(getAddressableInfo(store, "ui/profile")).toMatchObject({
      status: "found",
      asset: { guid: PROFILE, path: "Assets/UI/Profile.prefab", type: "Prefab", origin: "project" },
      isAddressable: true,
      addressable: {
        address: "ui/profile",
        group: {
          guid: UI_GROUP,
          name: "UI Remote",
          path: "Assets/AddressableAssetsData/AssetGroups/UI.asset",
        },
        readOnly: false,
        labels: ["remote", "ui"],
      },
      incomingReferences: 0,
      outgoingReferences: 1,
      reachableOnlyBecauseAddressable: true,
    });
    expect(getAddressableInfo(store, "Assets/UI/Local.prefab")).toMatchObject({
      status: "found",
      isAddressable: false,
      addressable: null,
      reachableOnlyBecauseAddressable: false,
    });
    expect(getAddressableInfo(store, "missing")).toEqual({ status: "not-found", input: "missing" });
    store.close();
  });

  test("returns sorted bounded candidates for duplicate names and addresses", () => {
    const store = buildStore();
    expect(getAddressableInfo(store, "Duplicate.prefab")).toMatchObject({
      status: "ambiguous",
      candidates: [
        { guid: DUPLICATE_A, path: "Assets/A/Duplicate.prefab" },
        { guid: DUPLICATE_B, path: "Assets/B/Duplicate.prefab" },
      ],
    });
    expect(getAddressableInfo(store, "duplicate/address")).toMatchObject({
      status: "ambiguous",
      candidates: [{ guid: DUPLICATE_A }, { guid: DUPLICATE_B }],
    });
    store.close();
  });
});

describe("searchAddressables", () => {
  test("filters entries and keeps deterministic path ordering", () => {
    const store = buildStore();
    expect(searchAddressables(store, { query: "profile" }).entries.map((entry) => entry.asset.guid)).toEqual([
      PROFILE,
    ]);
    expect(searchAddressables(store, { group: "Remote" }).entries.map((entry) => entry.asset.guid)).toEqual([
      DUPLICATE_A,
      PROFILE,
    ]);
    expect(searchAddressables(store, { label: "local" }).entries.map((entry) => entry.asset.guid)).toEqual([
      SHARED,
    ]);
    expect(searchAddressables(store, { pathPrefix: "Assets/UI/" }).entries.map((entry) => entry.asset.guid)).toEqual([
      PROFILE,
    ]);
    expect(searchAddressables(store, { type: "ScriptableObject" }).entries.map((entry) => entry.asset.guid)).toEqual([
      SHARED,
    ]);
    expect(
      searchAddressables(store, { reachableOnlyBecauseAddressable: false }).entries.map(
        (entry) => entry.asset.guid,
      ),
    ).toEqual([SHARED]);
    expect(searchAddressables(store, { query: "duplicate", limit: 1 })).toMatchObject({
      total: 2,
      truncated: true,
      entries: [{ asset: { guid: DUPLICATE_A } }],
    });
    store.close();
  });

  test("defaults and clamps output to 200 entries", () => {
    const store = GraphStore.open(":memory:");
    const nodes: AssetNode[] = [];
    const entries: AddressableGroup["entries"] = [];
    for (let i = 0; i < 205; i += 1) {
      const id = guid(1000 + i);
      const path = `Assets/Bulk/Entry-${i.toString().padStart(3, "0")}.prefab`;
      nodes.push(node(id, path, "Prefab"));
      entries.push({ guid: id, address: `bulk/${i}`, readOnly: false, labels: [] });
    }
    store.upsertNodes(nodes);
    store.replaceAddressableGroups([
      { groupGuid: UI_GROUP, assetGuid: guid(12), name: "Bulk", path: "Assets/Bulk.asset", entries },
    ]);

    expect(searchAddressables(store)).toMatchObject({ total: 205, truncated: true });
    expect(searchAddressables(store).entries).toHaveLength(200);
    expect(searchAddressables(store, { limit: 999 }).entries).toHaveLength(200);
    expect(searchAddressables(store, { limit: 0 }).entries).toHaveLength(1);
    store.close();
  });
});

describe("listAddressableGroups", () => {
  test("returns deterministic inventory with direct bytes and distinct sorted labels", () => {
    const store = buildStore();
    expect(listAddressableGroups(store)).toEqual([
      {
        guid: CORE_GROUP,
        name: "Core Local",
        path: "Assets/AddressableAssetsData/AssetGroups/Core.asset",
        entryCount: 2,
        indexedSourceBytes: 90,
        labels: ["local", "remote", "ui"],
      },
      {
        guid: UI_GROUP,
        name: "UI Remote",
        path: "Assets/AddressableAssetsData/AssetGroups/UI.asset",
        entryCount: 2,
        indexedSourceBytes: 120,
        labels: ["remote", "ui"],
      },
    ]);
    store.close();
  });
});
