import { mkdtemp, mkdir, writeFile, rm, readdir, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import Database from "better-sqlite3";
import { indexProject } from "./index-project.js";
import { GraphStore } from "../store/graph-store.js";

function meta(guid: string): string {
  return `fileFormatVersion: 2\nguid: ${guid}\nPrefabImporter:\n  externalObjects: {}\n`;
}

let root: string;
let dbPath: string;

async function writeAsset(rel: string, guid: string, body = "%YAML 1.1\n"): Promise<void> {
  await mkdir(join(root, rel, ".."), { recursive: true });
  await writeFile(join(root, rel), body);
  await writeFile(join(root, rel + ".meta"), meta(guid));
}

function addressableGroup(entries: { guid: string; address: string; labels: string[] }[]): string {
  const lines = [
    "%YAML 1.1",
    "MonoBehaviour:",
    "  m_Script: {fileID: 11500000, guid: bbb281ee3bf0b054c82ac2347e9e782c, type: 3}",
    "  m_Name: UI",
    `  m_GUID: ${"e".repeat(32)}`,
    "  m_SerializeEntries:",
  ];
  for (const entry of entries) {
    lines.push(`  - m_GUID: ${entry.guid}`);
    lines.push(`    m_Address: ${entry.address}`);
    lines.push("    m_ReadOnly: 0");
    if (entry.labels.length === 0) lines.push("    m_Labels: []");
    else {
      lines.push("    m_Labels:");
      for (const label of entry.labels) lines.push(`    - ${label}`);
    }
  }
  return lines.join("\n");
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "idx-proj-"));
  dbPath = join(root, "index.db");
  await mkdir(join(root, "Assets"), { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("indexProject fresh build", () => {
  test("writes an openable db with nodes and index_meta", async () => {
    await writeAsset("Assets/A.prefab", "a".repeat(32));
    await writeAsset("Assets/B.prefab", "b".repeat(32));

    const summary = await indexProject(root, { dbPath });
    expect(summary.assetCount).toBe(4); // 2 assets + 2 builtin nodes

    const store = GraphStore.open(dbPath);
    expect(store.assetCount()).toBe(4);
    expect(store.getMeta("project_root")).toBe(root);
    expect(store.getMeta("asset_count")).toBe("4");
    expect(store.getMeta("indexed_at")).not.toBeNull();
    store.close();
  });

  test("leaves no temporary build files behind", async () => {
    await writeAsset("Assets/A.prefab", "a".repeat(32));
    await indexProject(root, { dbPath });
    const leftovers = (await readdir(root)).filter((f) => f.includes("building"));
    expect(leftovers).toEqual([]);
  });
});

describe("indexProject incremental", () => {
  test("reports added, updated, removed, unchanged", async () => {
    await writeAsset("Assets/A.prefab", "a".repeat(32));
    await writeAsset("Assets/B.prefab", "b".repeat(32));
    await writeAsset("Assets/D.prefab", "d".repeat(32)); // stays unchanged
    await indexProject(root, { dbPath });

    // Change B (newer mtime), add C, remove A, leave D untouched.
    const future = new Date(Date.now() + 60_000);
    await utimes(join(root, "Assets/B.prefab"), future, future);
    await writeAsset("Assets/C.prefab", "c".repeat(32));
    await rm(join(root, "Assets/A.prefab"));
    await rm(join(root, "Assets/A.prefab.meta"));

    const summary = await indexProject(root, { dbPath });
    expect(summary.added).toBe(1); // C
    expect(summary.updated).toBe(1); // B
    expect(summary.removed).toBe(1); // A
    expect(summary.unchanged).toBe(1); // D

    const store = GraphStore.open(dbPath);
    expect(store.assetCount()).toBe(5); // B, C, D + 2 builtin nodes
    expect(store.getNode("a".repeat(32))).toBeNull();
    store.close();
  });

  test("force rebuilds from scratch", async () => {
    await writeAsset("Assets/A.prefab", "a".repeat(32));
    await indexProject(root, { dbPath });
    await writeAsset("Assets/B.prefab", "b".repeat(32));

    const summary = await indexProject(root, { dbPath, force: true });
    expect(summary.added).toBe(2);
    expect(summary.unchanged).toBe(0);
  });

  test("keeps changed and deleted Addressables group state authoritative", async () => {
    const groupPath = "Assets/AddressableAssetsData/AssetGroups/UI.asset";
    const assetGuid = "f".repeat(32);
    await writeAsset(
      groupPath,
      assetGuid,
      addressableGroup([
        { guid: "a".repeat(32), address: "ui/a", labels: ["old"] },
        { guid: "b".repeat(32), address: "ui/b", labels: [] },
      ]),
    );
    await indexProject(root, { dbPath });

    await writeFile(
      join(root, groupPath),
      addressableGroup([{ guid: "a".repeat(32), address: "ui/a-new", labels: ["new", "ui"] }]),
    );
    const future = new Date(Date.now() + 60_000);
    await utimes(join(root, groupPath), future, future);
    await indexProject(root, { dbPath });

    let store = GraphStore.open(dbPath);
    expect(store.db.prepare("SELECT group_guid, asset_guid, name, path FROM addressable_groups").all()).toEqual([
      { group_guid: "e".repeat(32), asset_guid: assetGuid, name: "UI", path: groupPath },
    ]);
    expect(store.db.prepare("SELECT guid, address, read_only FROM addressable_entries").all()).toEqual([
      { guid: "a".repeat(32), address: "ui/a-new", read_only: 0 },
    ]);
    expect(store.db.prepare("SELECT entry_guid, label FROM addressable_entry_labels ORDER BY label").all()).toEqual([
      { entry_guid: "a".repeat(32), label: "new" },
      { entry_guid: "a".repeat(32), label: "ui" },
    ]);
    store.close();

    await rm(join(root, groupPath));
    await rm(join(root, `${groupPath}.meta`));
    await indexProject(root, { dbPath });

    store = GraphStore.open(dbPath);
    expect(store.db.prepare("SELECT * FROM addressable_groups").all()).toEqual([]);
    expect(store.db.prepare("SELECT * FROM addressable_entries").all()).toEqual([]);
    expect(store.db.prepare("SELECT * FROM addressable_entry_labels").all()).toEqual([]);
    store.close();
  });

  test("rebuilds a schema-2 index before opening it as schema 3", async () => {
    const old = new Database(dbPath);
    old.exec(`
      CREATE TABLE index_meta (key TEXT PRIMARY KEY, value TEXT);
      INSERT INTO index_meta (key, value) VALUES ('schema_version', '2');
      CREATE TABLE addressable_entries (guid TEXT PRIMARY KEY, address TEXT);
    `);
    old.close();
    await writeAsset("Assets/A.prefab", "a".repeat(32));

    await indexProject(root, { dbPath });

    expect(GraphStore.readSchemaVersion(dbPath)).toBe(3);
    const store = GraphStore.open(dbPath);
    expect(store.assetCount()).toBe(3);
    expect(store.getNode("a".repeat(32))?.path).toBe("Assets/A.prefab");
    store.close();
  });
});

describe("indexProject atomicity", () => {
  test("a failing scan leaves the prior index intact", async () => {
    await writeAsset("Assets/A.prefab", "a".repeat(32));
    await indexProject(root, { dbPath });

    await expect(
      indexProject(root, {
        dbPath,
        scan: async () => {
          throw new Error("boom");
        },
      }),
    ).rejects.toThrow("boom");

    const store = GraphStore.open(dbPath);
    expect(store.assetCount()).toBe(3); // 1 asset + 2 builtin nodes
    store.close();
  });
});
