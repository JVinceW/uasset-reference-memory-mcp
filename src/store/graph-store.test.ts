import { mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { GraphStore } from "./graph-store.js";
import { SCHEMA_VERSION } from "./schema.js";
import type { AssetNode, Edge, UnresolvedRef } from "../indexer/types.js";
import type { AddressableGroup, AddressableGroupEntry } from "../indexer/addressables.js";

function node(over: Partial<AssetNode> & Pick<AssetNode, "guid" | "path">): AssetNode {
  return {
    name: over.path.slice(over.path.lastIndexOf("/") + 1),
    assetType: "Prefab",
    origin: "project",
    packageId: null,
    fileSize: 100,
    mtime: 1000,
    isBinary: false,
    ...over,
  };
}

function entry(guid: string, labels: string[]): AddressableGroupEntry {
  return { guid: guid.repeat(32), address: `ui/${guid}`, readOnly: false, labels };
}

function group(name: string, entries: AddressableGroupEntry[]): AddressableGroup {
  return {
    groupGuid: "e".repeat(32),
    assetGuid: "f".repeat(32),
    name,
    path: `Assets/AddressableAssetsData/AssetGroups/${name}.asset`,
    entries,
  };
}

describe("GraphStore schema", () => {
  test("creates the four tables and records schema_version", () => {
    const store = GraphStore.open(":memory:");
    const tables = store.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r) => (r as { name: string }).name);
    expect(tables).toEqual(
      expect.arrayContaining(["assets", "edges", "index_meta", "unresolved_refs"]),
    );
    expect(store.getMeta("schema_version")).toBe(String(SCHEMA_VERSION));
    store.close();
  });

  test("schema 3 stores normalized groups, entries, and labels", () => {
    const store = GraphStore.open(":memory:");
    expect(store.getMeta("schema_version")).toBe("3");
    const tables = store.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);
    expect(tables).toEqual(
      expect.arrayContaining([
        "addressable_groups",
        "addressable_entries",
        "addressable_entry_labels",
      ]),
    );
    store.close();
  });
});

describe("GraphStore canonical guid detection", () => {
  test("accepts an empty schema-3 store", async () => {
    const root = await mkdtemp(join(tmpdir(), "graph-store-guid-"));
    const path = join(root, "index.db");
    const store = GraphStore.open(path);
    store.close();

    try {
      expect(GraphStore.requiresLegacyRebuild(path)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("accepts canonical lowercase asset guids at unique paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "graph-store-guid-"));
    const path = join(root, "index.db");
    const store = GraphStore.open(path);
    store.upsertNodes([
      node({ guid: "abcdef0123456789abcdef0123456789", path: "Assets/A.prefab" }),
    ]);
    store.close();

    try {
      expect(GraphStore.requiresLegacyRebuild(path)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("detects uppercase asset guid identity", async () => {
    const root = await mkdtemp(join(tmpdir(), "graph-store-guid-"));
    const path = join(root, "index.db");
    const store = GraphStore.open(path);
    store.upsertNodes([
      node({ guid: "ABCDEF0123456789ABCDEF0123456789", path: "Assets/A.prefab" }),
    ]);
    store.close();

    try {
      expect(GraphStore.requiresLegacyRebuild(path)).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("detects duplicate asset paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "graph-store-guid-"));
    const path = join(root, "index.db");
    const store = GraphStore.open(path);
    store.upsertNodes([
      node({ guid: "a".repeat(32), path: "Assets/Target.prefab" }),
      node({ guid: "b".repeat(32), path: "Assets/Target.prefab" }),
    ]);
    store.close();

    try {
      expect(GraphStore.requiresLegacyRebuild(path)).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("closes the read-only compatibility probe handle", async () => {
    const root = await mkdtemp(join(tmpdir(), "graph-store-guid-"));
    const path = join(root, "index.db");
    const movedPath = join(root, "moved.db");
    const store = GraphStore.open(path);
    store.upsertNodes([
      node({ guid: "a".repeat(32), path: "Assets/A.prefab" }),
      node({ guid: "b".repeat(32), path: "Assets/B.prefab" }),
    ]);
    store.close();

    try {
      expect(GraphStore.requiresLegacyRebuild(path)).toBe(false);
      await rename(path, movedPath);
      await rename(movedPath, path);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("GraphStore Addressables replacement", () => {
  test("persists only explicitly supplied Addressables groups", () => {
    const store = GraphStore.open(":memory:");
    store.replaceAddressableGroups([group("UI", [entry("a", [])])]);
    expect(store.db.prepare("SELECT group_guid, asset_guid, name, path FROM addressable_groups").all()).toEqual([
      {
        group_guid: "e".repeat(32),
        asset_guid: "f".repeat(32),
        name: "UI",
        path: "Assets/AddressableAssetsData/AssetGroups/UI.asset",
      },
    ]);
    expect("insertAddressableEntries" in store).toBe(false);
    store.close();
  });

  test("replacing a changed group removes stale entries and labels", () => {
    const store = GraphStore.open(":memory:");
    store.replaceAddressableGroups([group("UI", [entry("a", ["old"]), entry("b", [])])]);
    store.replaceAddressableGroupsForAssets(
      ["f".repeat(32)],
      [group("UI", [entry("a", ["new"])])],
    );
    expect(store.addressableCount()).toBe(1);
    expect(store.db.prepare("SELECT label FROM addressable_entry_labels").all()).toEqual([
      { label: "new" },
    ]);
    store.close();
  });

  test("replacing a deleted group asset removes its membership", () => {
    const store = GraphStore.open(":memory:");
    store.replaceAddressableGroups([group("UI", [entry("a", [])])]);
    store.replaceAddressableGroupsForAssets(["f".repeat(32)], []);
    expect(store.addressableCount()).toBe(0);
    store.close();
  });
});

describe("GraphStore node writes", () => {
  test("upserts nodes and reads them back", () => {
    const store = GraphStore.open(":memory:");
    store.upsertNodes([
      node({ guid: "a".repeat(32), path: "Assets/A.prefab" }),
      node({ guid: "b".repeat(32), path: "Assets/B.mat", assetType: "Material" }),
    ]);
    expect(store.assetCount()).toBe(2);
    expect(store.getNode("b".repeat(32))?.assetType).toBe("Material");
    store.close();
  });

  test("upsert is idempotent on guid and updates changed fields", () => {
    const store = GraphStore.open(":memory:");
    store.upsertNodes([node({ guid: "a".repeat(32), path: "Assets/A.prefab", mtime: 1 })]);
    store.upsertNodes([node({ guid: "a".repeat(32), path: "Assets/A.prefab", mtime: 999 })]);
    expect(store.assetCount()).toBe(1);
    expect(store.getNode("a".repeat(32))?.mtime).toBe(999);
    store.close();
  });

  test("round-trips boolean isBinary and null fields", () => {
    const store = GraphStore.open(":memory:");
    store.upsertNodes([
      node({
        guid: "f".repeat(32),
        path: "Assets/Folder",
        assetType: "Folder",
        isBinary: true,
        fileSize: null,
      }),
    ]);
    const n = store.getNode("f".repeat(32))!;
    expect(n.isBinary).toBe(true);
    expect(n.fileSize).toBeNull();
    store.close();
  });
});

describe("GraphStore edge and unresolved writes", () => {
  test("inserts edges and unresolved refs and counts them", () => {
    const store = GraphStore.open(":memory:");
    const edges: Edge[] = [
      {
        fromGuid: "a".repeat(32),
        toGuid: "b".repeat(32),
        refKind: "USES_MATERIAL",
        fileId: "2100000",
        context: "m_Materials",
        count: 1,
      },
    ];
    const unresolved: UnresolvedRef[] = [
      { fromGuid: "a".repeat(32), toGuid: "z".repeat(32), context: "m_Script" },
    ];
    store.insertEdges(edges);
    store.insertUnresolved(unresolved);
    expect(store.edgeCount()).toBe(1);
    expect(store.unresolvedCount()).toBe(1);
    store.close();
  });

  test("collapses duplicate edges via primary key, summing count", () => {
    const store = GraphStore.open(":memory:");
    const e: Edge = {
      fromGuid: "a".repeat(32),
      toGuid: "b".repeat(32),
      refKind: "USES_TEXTURE",
      fileId: null,
      context: "_MainTex",
      count: 1,
    };
    store.insertEdges([e]);
    store.insertEdges([{ ...e, count: 2 }]);
    expect(store.edgeCount()).toBe(1);
    store.close();
  });
});

describe("GraphStore meta", () => {
  test("sets and gets arbitrary meta keys", () => {
    const store = GraphStore.open(":memory:");
    store.setMeta("project_root", "/tmp/proj");
    expect(store.getMeta("project_root")).toBe("/tmp/proj");
    expect(store.getMeta("does_not_exist")).toBeNull();
    store.close();
  });

  test("exposes existing guid->mtime map for incremental indexing", () => {
    const store = GraphStore.open(":memory:");
    store.upsertNodes([
      node({ guid: "a".repeat(32), path: "Assets/A.prefab", mtime: 5 }),
      node({ guid: "b".repeat(32), path: "Assets/B.prefab", mtime: 7 }),
    ]);
    const map = store.getNodeMtimes();
    expect(map.get("Assets/A.prefab")).toEqual({ guid: "a".repeat(32), mtime: 5 });
    expect(map.size).toBe(2);
    store.close();
  });
});
