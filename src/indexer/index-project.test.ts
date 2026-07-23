import { mkdtemp, mkdir, writeFile, rm, readdir, rename, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import Database from "better-sqlite3";
import { indexProject } from "./index-project.js";
import { DuplicateGuidError } from "./guid-validation.js";
import { scanProject } from "./meta-scanner.js";
import { GraphStore } from "../store/graph-store.js";
import type { AssetNode } from "./types.js";

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

async function externalPackage(name: string, guid?: string): Promise<string> {
  const external = join(root, "external", name, guid ?? "default");
  await mkdir(external, { recursive: true });
  await writeFile(join(external, "package.json"), JSON.stringify({ name, version: "1.0.0" }));
  if (guid) await packageAsset(external, "Runtime/Rules.asset", guid);
  return external;
}

async function packageAsset(
  packageRoot: string,
  path: string,
  guid: string,
  body = "%YAML 1.1\n",
): Promise<void> {
  const assetPath = join(packageRoot, path);
  await mkdir(join(assetPath, ".."), { recursive: true });
  await writeFile(assetPath, body);
  await writeFile(`${assetPath}.meta`, meta(guid));
}

async function projectManifest(dependencies: Record<string, string>): Promise<void> {
  await mkdir(join(root, "Packages"), { recursive: true });
  await writeFile(join(root, "Packages", "manifest.json"), JSON.stringify({ dependencies }));
}

function scannedNode(guid: string, path: string): AssetNode {
  return {
    guid,
    path,
    name: path.split("/").at(-1) ?? path,
    assetType: "Other",
    origin: "project",
    packageId: null,
    fileSize: 1,
    mtime: 0,
    isBinary: false,
  };
}

function addressableGroup(
  entries: { guid: string; address: string; labels: string[] }[],
  groupGuid = "e".repeat(32),
): string {
  const lines = [
    "%YAML 1.1",
    "MonoBehaviour:",
    "  m_Script: {fileID: 11500000, guid: bbb281ee3bf0b054c82ac2347e9e782c, type: 3}",
    "  m_Name: UI",
    `  m_GUID: ${groupGuid}`,
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

  test("resolves a lowercase serialized reference to an uppercase meta guid", async () => {
    const sourceGuid = "1".repeat(32);
    const uppercaseTargetGuid = "ABCDEF0123456789ABCDEF0123456789";
    const targetGuid = uppercaseTargetGuid.toLowerCase();
    await writeAsset("Assets/Target.prefab", uppercaseTargetGuid);
    await writeAsset(
      "Assets/Source.prefab",
      sourceGuid,
      `%YAML 1.1\nPrefab:\n  m_Target: {fileID: 100100000, guid: ${targetGuid}, type: 3}\n`,
    );

    await indexProject(root, { dbPath });

    const store = GraphStore.open(dbPath);
    try {
      expect(store.getNode(targetGuid)?.path).toBe("Assets/Target.prefab");
      expect(store.incomingEdges(targetGuid)).toHaveLength(1);
      expect(store.unresolvedCount()).toBe(0);
    } finally {
      store.close();
    }
  });
});

describe("indexProject incremental", () => {
  test("updates and removes external package assets incrementally", async () => {
    const external = await externalPackage("com.company.gameplay");
    await projectManifest({
      "com.company.gameplay": `file:${external.replaceAll("\\\\", "/")}`,
    });
    await packageAsset(external, "Runtime/Rules.asset", "a".repeat(32), "value: 1");
    await indexProject(root, { dbPath });

    await packageAsset(external, "Runtime/Rules.asset", "a".repeat(32), "value: 2");
    const advanced = new Date(Date.now() + 2_000);
    await utimes(join(external, "Runtime", "Rules.asset"), advanced, advanced);
    const changed = await indexProject(root, { dbPath });
    expect(changed.updated).toBe(1);

    await rm(join(external, "Runtime", "Rules.asset"));
    await rm(join(external, "Runtime", "Rules.asset.meta"));
    const removed = await indexProject(root, { dbPath });
    expect(removed.removed).toBe(1);
  });

  test("reconciles a retargeted local dependency and records its fingerprint", async () => {
    const first = await externalPackage("com.company.gameplay", "a".repeat(32));
    const second = await externalPackage("com.company.gameplay", "b".repeat(32));
    await projectManifest({ "com.company.gameplay": `file:${first}` });
    await indexProject(root, { dbPath });
    const firstStore = GraphStore.open(dbPath);
    const firstFingerprint = firstStore.getMeta("package_discovery_fingerprint");
    firstStore.close();

    await projectManifest({ "com.company.gameplay": `file:${second}` });
    const summary = await indexProject(root, { dbPath });
    const store = GraphStore.open(dbPath);

    expect(summary.added).toBe(1);
    expect(summary.removed).toBe(1);
    expect(store.getMeta("package_discovery_fingerprint")).not.toBe(firstFingerprint);
    expect(store.getNode("b".repeat(32))).not.toBeNull();
    expect(store.getNode("a".repeat(32))).toBeNull();
    store.close();
  });

  test("counts a meta-only change as one updated logical asset", async () => {
    const guid = "a".repeat(32);
    const assetPath = "Assets/A.prefab";
    await writeAsset(assetPath, guid);
    await indexProject(root, { dbPath });

    const future = new Date(Date.now() + 60_000);
    await utimes(join(root, `${assetPath}.meta`), future, future);

    const summary = await indexProject(root, { dbPath });
    expect(summary).toMatchObject({ added: 0, updated: 1, removed: 0 });

    const store = GraphStore.open(dbPath);
    expect(
      store.db.prepare("SELECT COUNT(*) AS count FROM assets WHERE guid = ?").get(guid),
    ).toEqual({ count: 1 });
    store.close();
  });

  test("reconciles a moved guid as one update and preserves incoming references", async () => {
    const sourceGuid = "a".repeat(32);
    const targetGuid = "b".repeat(32);
    const originalPath = "Assets/Original/Target.prefab";
    const movedPath = "Assets/Moved/Target.prefab";
    await writeAsset(originalPath, targetGuid);
    await writeAsset(
      "Assets/Source.prefab",
      sourceGuid,
      `%YAML 1.1\nPrefab:\n  m_Target: {fileID: 100100000, guid: ${targetGuid}, type: 3}\n`,
    );
    await indexProject(root, { dbPath });

    await mkdir(join(root, "Assets/Moved"), { recursive: true });
    await rename(join(root, originalPath), join(root, movedPath));
    await rename(join(root, `${originalPath}.meta`), join(root, `${movedPath}.meta`));

    const summary = await indexProject(root, { dbPath });
    expect(summary).toMatchObject({ added: 0, updated: 1, removed: 0 });

    const store = GraphStore.open(dbPath);
    expect(store.getNode(targetGuid)?.path).toBe(movedPath);
    expect(store.incomingEdges(targetGuid)).toHaveLength(1);
    store.close();
  });

  test("retypes incoming references when a stable guid changes asset type", async () => {
    const sourceGuid = "a".repeat(32);
    const targetGuid = "b".repeat(32);
    const originalPath = "Assets/Target.mat";
    const movedPath = "Assets/Target.prefab";
    await writeAsset(originalPath, targetGuid);
    await writeAsset(
      "Assets/Source.prefab",
      sourceGuid,
      `%YAML 1.1\nPrefab:\n  m_Target: {fileID: 100100000, guid: ${targetGuid}, type: 3}\n`,
    );
    await indexProject(root, { dbPath });

    let store = GraphStore.open(dbPath);
    expect(store.incomingEdges(targetGuid)).toMatchObject([{ refKind: "USES_MATERIAL" }]);
    store.close();

    await rename(join(root, originalPath), join(root, movedPath));
    await rename(join(root, `${originalPath}.meta`), join(root, `${movedPath}.meta`));

    const summary = await indexProject(root, { dbPath });
    expect(summary).toMatchObject({ added: 0, updated: 1, removed: 0, unchanged: 1 });

    store = GraphStore.open(dbPath);
    expect(store.incomingEdges(targetGuid)).toEqual([
      {
        fromGuid: sourceGuid,
        toGuid: targetGuid,
        refKind: "NESTED_PREFAB",
        fileId: "100100000",
        context: "m_Target",
        count: 1,
      },
    ]);
    store.close();
  });

  test("reports a guid replacement and leaves references to the old guid unresolved", async () => {
    const sourceGuid = "a".repeat(32);
    const oldGuid = "b".repeat(32);
    const newGuid = "c".repeat(32);
    const targetPath = "Assets/Target.prefab";
    await writeAsset(targetPath, oldGuid);
    await writeAsset(
      "Assets/Source.prefab",
      sourceGuid,
      `%YAML 1.1\nPrefab:\n  m_Target: {fileID: 100100000, guid: ${oldGuid}, type: 3}\n`,
    );
    await indexProject(root, { dbPath });

    await writeFile(join(root, `${targetPath}.meta`), meta(newGuid));

    const summary = await indexProject(root, { dbPath });
    expect(summary).toMatchObject({ added: 1, updated: 0, removed: 1 });
    expect(summary.warnings).toContainEqual({
      kind: "guid-replaced",
      path: targetPath,
      message: `asset guid replaced at ${targetPath}: ${oldGuid} -> ${newGuid}`,
    });

    const store = GraphStore.open(dbPath);
    expect(store.getNode(oldGuid)).toBeNull();
    expect(store.getNode(newGuid)?.path).toBe(targetPath);
    expect(store.incomingEdges(oldGuid)).toHaveLength(0);
    expect(
      store.db
        .prepare("SELECT from_guid, to_guid FROM unresolved_refs WHERE to_guid = ?")
        .all(oldGuid),
    ).toEqual([{ from_guid: sourceGuid, to_guid: oldGuid }]);
    store.close();
  });

  test("counts a moved guid and a new guid at its former path independently", async () => {
    const movedGuid = "a".repeat(32);
    const newGuid = "b".repeat(32);
    const formerPath = "Assets/Original.prefab";
    const movedPath = "Assets/Moved.prefab";
    await writeAsset(formerPath, movedGuid);
    await indexProject(root, { dbPath });

    await rename(join(root, formerPath), join(root, movedPath));
    await rename(join(root, `${formerPath}.meta`), join(root, `${movedPath}.meta`));
    await writeAsset(formerPath, newGuid);

    const summary = await indexProject(root, { dbPath });
    expect(summary).toMatchObject({ added: 1, updated: 1, removed: 0 });

    const store = GraphStore.open(dbPath);
    expect(store.getNode(movedGuid)?.path).toBe(movedPath);
    expect(store.getNode(newGuid)?.path).toBe(formerPath);
    store.close();
  });

  test("counts a path swap between stable guids as two updates", async () => {
    const firstGuid = "a".repeat(32);
    const secondGuid = "b".repeat(32);
    const firstPath = "Assets/First.prefab";
    const secondPath = "Assets/Second.prefab";
    const tempPath = "Assets/Swap.tmp";
    await writeAsset(firstPath, firstGuid);
    await writeAsset(secondPath, secondGuid);
    await indexProject(root, { dbPath });

    await rename(join(root, firstPath), join(root, tempPath));
    await rename(join(root, `${firstPath}.meta`), join(root, `${tempPath}.meta`));
    await rename(join(root, secondPath), join(root, firstPath));
    await rename(join(root, `${secondPath}.meta`), join(root, `${firstPath}.meta`));
    await rename(join(root, tempPath), join(root, secondPath));
    await rename(join(root, `${tempPath}.meta`), join(root, `${secondPath}.meta`));

    const summary = await indexProject(root, { dbPath });
    expect(summary).toMatchObject({ added: 0, updated: 2, removed: 0 });

    const store = GraphStore.open(dbPath);
    expect(store.getNode(firstGuid)?.path).toBe(secondPath);
    expect(store.getNode(secondGuid)?.path).toBe(firstPath);
    store.close();
  });

  test("refreshes a moved Addressables group path and retains its entries", async () => {
    const groupGuid = "f".repeat(32);
    const entryGuid = "a".repeat(32);
    const originalPath = "Assets/AddressableAssetsData/AssetGroups/UI.asset";
    const movedPath = "Assets/AddressableAssetsData/AssetGroups/Moved/UI.asset";
    await writeAsset(
      originalPath,
      groupGuid,
      addressableGroup([{ guid: entryGuid, address: "ui/main", labels: ["ui"] }]),
    );
    await indexProject(root, { dbPath });

    await mkdir(join(root, "Assets/AddressableAssetsData/AssetGroups/Moved"), {
      recursive: true,
    });
    await rename(join(root, originalPath), join(root, movedPath));
    await rename(join(root, `${originalPath}.meta`), join(root, `${movedPath}.meta`));

    const summary = await indexProject(root, { dbPath });
    expect(summary).toMatchObject({ added: 0, updated: 1, removed: 0 });

    const store = GraphStore.open(dbPath);
    expect(
      store.db.prepare("SELECT asset_guid, path FROM addressable_groups").all(),
    ).toEqual([{ asset_guid: groupGuid, path: movedPath }]);
    expect(
      store.db.prepare("SELECT guid, address FROM addressable_entries").all(),
    ).toEqual([{ guid: entryGuid, address: "ui/main" }]);
    store.close();
  });

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

  test("force refreshes equal-length content changes with preserved timestamps", async () => {
    const sourceGuid = "a".repeat(32);
    const firstTargetGuid = "b".repeat(32);
    const secondTargetGuid = "c".repeat(32);
    const sourcePath = "Assets/Source.prefab";
    const referenceBody = (guid: string) =>
      `%YAML 1.1\nPrefab:\n  m_Target: {fileID: 100100000, guid: ${guid}, type: 3}\n`;
    await writeAsset(sourcePath, sourceGuid, referenceBody(firstTargetGuid));
    await writeAsset("Assets/First.prefab", firstTargetGuid);
    await writeAsset("Assets/Second.prefab", secondTargetGuid);
    const preserved = new Date(Date.now() - 60_000);
    await utimes(join(root, sourcePath), preserved, preserved);
    await utimes(join(root, `${sourcePath}.meta`), preserved, preserved);
    await indexProject(root, { dbPath });

    await writeFile(join(root, sourcePath), referenceBody(secondTargetGuid));
    await utimes(join(root, sourcePath), preserved, preserved);
    await utimes(join(root, `${sourcePath}.meta`), preserved, preserved);

    const incremental = await indexProject(root, { dbPath });
    expect(incremental).toMatchObject({ added: 0, updated: 0, removed: 0 });
    let store = GraphStore.open(dbPath);
    expect(store.outgoingEdges(sourceGuid).map((edge) => edge.toGuid)).toEqual([
      firstTargetGuid,
    ]);
    store.close();

    await indexProject(root, { dbPath, force: true });
    store = GraphStore.open(dbPath);
    expect(store.outgoingEdges(sourceGuid).map((edge) => edge.toGuid)).toEqual([
      secondTargetGuid,
    ]);
    store.close();
  });

  test("removes a target with a missing meta and restores its full edge fidelity", async () => {
    const sourceGuid = "a".repeat(32);
    const targetGuid = "b".repeat(32);
    const targetPath = "Assets/Target.prefab";
    await writeAsset(targetPath, targetGuid);
    await writeAsset(
      "Assets/Source.prefab",
      sourceGuid,
      `%YAML 1.1\nPrefab:\n  m_Target: {fileID: 100100000, guid: ${targetGuid}, type: 3}\n  m_Target: {fileID: 100100000, guid: ${targetGuid}, type: 3}\n`,
    );
    await indexProject(root, { dbPath });

    await rm(join(root, `${targetPath}.meta`));
    const incomplete = await indexProject(root, { dbPath });
    expect(incomplete).toMatchObject({ added: 0, removed: 1 });
    expect(incomplete.warnings).toContainEqual({
      kind: "missing-meta",
      path: targetPath,
      message: `asset has no .meta: ${targetPath}`,
    });

    let store = GraphStore.open(dbPath);
    expect(store.getNode(targetGuid)).toBeNull();
    expect(store.incomingEdges(targetGuid)).toEqual([]);
    expect(
      store.db
        .prepare("SELECT from_guid, to_guid FROM unresolved_refs WHERE to_guid = ?")
        .all(targetGuid),
    ).toEqual([{ from_guid: sourceGuid, to_guid: targetGuid }]);
    store.close();

    await writeFile(join(root, `${targetPath}.meta`), meta(targetGuid));
    const restored = await indexProject(root, { dbPath });
    expect(restored).toMatchObject({ added: 1, removed: 0, unchanged: 1 });
    store = GraphStore.open(dbPath);
    expect(store.getNode(targetGuid)?.path).toBe(targetPath);
    expect(store.incomingEdges(targetGuid)).toEqual([
      {
        fromGuid: sourceGuid,
        toGuid: targetGuid,
        refKind: "NESTED_PREFAB",
        fileId: "100100000",
        context: "m_Target",
        count: 2,
      },
    ]);
    expect(store.unresolvedCount()).toBe(0);
    store.close();
  });

  test("warns and removes an indexed target when only its orphan meta remains", async () => {
    const targetGuid = "b".repeat(32);
    const targetPath = "Assets/Target.prefab";
    await writeAsset(targetPath, targetGuid);
    await indexProject(root, { dbPath });

    await rm(join(root, targetPath));
    const summary = await indexProject(root, { dbPath });

    expect(summary).toMatchObject({ removed: 1 });
    expect(summary.warnings).toContainEqual({
      kind: "orphan-meta",
      path: targetPath,
      message: `.meta has no matching asset: ${targetPath}`,
    });
    const store = GraphStore.open(dbPath);
    expect(store.getNode(targetGuid)).toBeNull();
    store.close();
  });

  test("warns and removes an indexed target whose meta no longer has a valid guid", async () => {
    const targetGuid = "b".repeat(32);
    const targetPath = "Assets/Target.prefab";
    await writeAsset(targetPath, targetGuid);
    await indexProject(root, { dbPath });

    await writeFile(join(root, `${targetPath}.meta`), "fileFormatVersion: 2\nPrefabImporter:\n");
    const summary = await indexProject(root, { dbPath });

    expect(summary).toMatchObject({ removed: 1 });
    expect(summary.warnings).toContainEqual({
      kind: "invalid-meta",
      path: targetPath,
      message: `.meta has no parseable guid: ${targetPath}.meta`,
    });
    const store = GraphStore.open(dbPath);
    expect(store.getNode(targetGuid)).toBeNull();
    store.close();
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

  test("rebuilds a pre-canonical schema-3 index from current project files", async () => {
    const sourceGuidUpper = "A".repeat(32);
    const targetGuidUpper = "B".repeat(32);
    const missingGuidUpper = "D".repeat(32);
    const groupAssetGuidUpper = "F".repeat(32);
    const groupGuidUpper = "E".repeat(32);
    const sourceGuid = sourceGuidUpper.toLowerCase();
    const targetGuid = targetGuidUpper.toLowerCase();
    const missingGuid = missingGuidUpper.toLowerCase();
    const groupAssetGuid = groupAssetGuidUpper.toLowerCase();
    const groupGuid = groupGuidUpper.toLowerCase();
    const groupPath = "Assets/AddressableAssetsData/AssetGroups/UI.asset";

    const legacy = GraphStore.open(dbPath);
    legacy.upsertNodes([
      { ...scannedNode(sourceGuidUpper, "Assets/Source.prefab"), assetType: "Prefab" },
      { ...scannedNode(targetGuidUpper, "Assets/Target.prefab"), assetType: "Prefab" },
      { ...scannedNode(groupAssetGuidUpper, groupPath), assetType: "Other" },
    ]);
    legacy.insertEdges([
      {
        fromGuid: sourceGuidUpper,
        toGuid: targetGuidUpper,
        refKind: "USES_MATERIAL",
        fileId: null,
        context: "legacy-edge",
        count: 1,
      },
    ]);
    legacy.insertUnresolved([
      {
        fromGuid: sourceGuidUpper,
        toGuid: missingGuidUpper,
        context: "legacy-unresolved",
      },
    ]);
    legacy.replaceAddressableGroups([
      {
        groupGuid: groupGuidUpper,
        assetGuid: groupAssetGuidUpper,
        name: "Legacy UI",
        path: groupPath,
        entries: [
          {
            guid: targetGuidUpper,
            address: "ui/legacy",
            readOnly: false,
            labels: ["legacy"],
          },
        ],
      },
    ]);
    legacy.close();

    await writeAsset(
      "Assets/Source.prefab",
      sourceGuidUpper,
      [
        "%YAML 1.1",
        "Prefab:",
        `  m_Target: {fileID: 100100000, guid: ${targetGuidUpper}, type: 3}`,
        `  m_Missing: {fileID: 100100000, guid: ${missingGuidUpper}, type: 3}`,
      ].join("\n"),
    );
    await writeAsset("Assets/Target.prefab", targetGuidUpper);
    await writeAsset(
      groupPath,
      groupAssetGuidUpper,
      addressableGroup(
        [{ guid: targetGuidUpper, address: "ui/current", labels: ["current"] }],
        groupGuidUpper,
      ),
    );

    const summary = await indexProject(root, { dbPath });
    expect(summary).toMatchObject({ added: 3, updated: 0, removed: 0, unchanged: 0 });
    expect(summary.warnings).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "guid-replaced" })]),
    );

    const store = GraphStore.open(dbPath);
    try {
      const storedGuids = store.db.prepare(`
        SELECT guid FROM assets
        UNION ALL SELECT from_guid AS guid FROM edges
        UNION ALL SELECT to_guid AS guid FROM edges
        UNION ALL SELECT from_guid AS guid FROM unresolved_refs
        UNION ALL SELECT to_guid AS guid FROM unresolved_refs
        UNION ALL SELECT group_guid AS guid FROM addressable_groups
        UNION ALL SELECT asset_guid AS guid FROM addressable_groups
        UNION ALL SELECT guid FROM addressable_entries
        UNION ALL SELECT group_guid AS guid FROM addressable_entries
        UNION ALL SELECT entry_guid AS guid FROM addressable_entry_labels
      `).all() as { guid: string }[];
      expect(storedGuids.every(({ guid }) => guid === guid.toLowerCase())).toBe(true);
      expect(store.outgoingEdges(sourceGuid)).toEqual([
        {
          fromGuid: sourceGuid,
          toGuid: targetGuid,
          refKind: "NESTED_PREFAB",
          fileId: "100100000",
          context: "m_Target",
          count: 1,
        },
      ]);
      expect(
        store.db
          .prepare("SELECT from_guid, to_guid, context FROM unresolved_refs WHERE from_guid = ?")
          .all(sourceGuid),
      ).toEqual([{ from_guid: sourceGuid, to_guid: missingGuid, context: "m_Missing" }]);
      expect(
        store.db.prepare("SELECT group_guid, asset_guid, name, path FROM addressable_groups").all(),
      ).toEqual([{ group_guid: groupGuid, asset_guid: groupAssetGuid, name: "UI", path: groupPath }]);
      expect(
        store.db.prepare("SELECT guid, address, group_guid FROM addressable_entries").all(),
      ).toEqual([{ guid: targetGuid, address: "ui/current", group_guid: groupGuid }]);
      expect(
        store.db.prepare("SELECT entry_guid, label FROM addressable_entry_labels").all(),
      ).toEqual([{ entry_guid: targetGuid, label: "current" }]);
    } finally {
      store.close();
    }
  });

  test("rebuilds a legacy schema-3 index with duplicate asset paths", async () => {
    const oldTargetGuid = "a".repeat(32);
    const currentTargetGuid = "b".repeat(32);
    const sourceGuid = "c".repeat(32);
    const targetPath = "Assets/Target.prefab";
    const sourcePath = "Assets/Source.prefab";
    await writeAsset(targetPath, currentTargetGuid);
    await writeAsset(
      sourcePath,
      sourceGuid,
      `%YAML 1.1\nPrefab:\n  m_Target: {fileID: 100100000, guid: ${oldTargetGuid}, type: 3}\n`,
    );

    const current = await scanProject(root);
    const currentTarget = current.nodes.find((node) => node.guid === currentTargetGuid)!;
    const currentSource = current.nodes.find((node) => node.guid === sourceGuid)!;
    const legacy = GraphStore.open(dbPath);
    legacy.upsertNodes([
      { ...currentTarget, guid: oldTargetGuid },
      currentTarget,
      currentSource,
    ]);
    legacy.insertEdges([
      {
        fromGuid: sourceGuid,
        toGuid: oldTargetGuid,
        refKind: "NESTED_PREFAB",
        fileId: "100100000",
        context: "m_Target",
        count: 1,
      },
    ]);
    expect(legacy.getNodeMtimes().get(targetPath)?.guid).toBe(currentTargetGuid);
    legacy.close();

    const summary = await indexProject(root, { dbPath });
    expect(summary).toMatchObject({ added: 2, updated: 0, removed: 0, unchanged: 0 });
    expect(summary.warnings).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "guid-replaced" })]),
    );

    const store = GraphStore.open(dbPath);
    try {
      expect(
        store.db
          .prepare("SELECT guid, path FROM assets WHERE origin = 'project' ORDER BY path")
          .all(),
      ).toEqual([
        { guid: sourceGuid, path: sourcePath },
        { guid: currentTargetGuid, path: targetPath },
      ]);
      expect(store.getNode(oldTargetGuid)).toBeNull();
      expect(store.outgoingEdges(sourceGuid)).toEqual([]);
      expect(
        store.db
          .prepare("SELECT from_guid, to_guid, context FROM unresolved_refs")
          .all(),
      ).toEqual([{ from_guid: sourceGuid, to_guid: oldTargetGuid, context: "m_Target" }]);
    } finally {
      store.close();
    }
    expect((await readdir(root)).filter((name) => name.includes("building"))).toEqual([]);
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

  test("a duplicate scanned GUID leaves the prior index intact", async () => {
    const validGuid = "a".repeat(32);
    const duplicateGuid = "d".repeat(32);
    await writeAsset("Assets/Valid.prefab", validGuid);
    await indexProject(root, { dbPath });

    await expect(indexProject(root, {
      dbPath,
      scan: async () => ({
        nodes: [
          scannedNode(duplicateGuid, "Assets/First.prefab"),
          scannedNode(duplicateGuid, "Assets/Second.prefab"),
        ],
        warnings: [],
      }),
    })).rejects.toBeInstanceOf(DuplicateGuidError);

    const store = GraphStore.open(dbPath);
    expect(store.assetCount()).toBe(3); // valid asset + 2 builtin nodes
    expect(store.getNode(validGuid)?.path).toBe("Assets/Valid.prefab");
    store.close();
  });

  test("a failed legacy rebuild leaves the uppercase index intact", async () => {
    const uppercaseGuid = "ABCDEF0123456789ABCDEF0123456789";
    const legacy = GraphStore.open(dbPath);
    legacy.upsertNodes([scannedNode(uppercaseGuid, "Assets/Legacy.prefab")]);
    legacy.close();
    let stagedAssetCount = -1;

    await expect(
      indexProject(root, {
        dbPath,
        scan: async () => {
          const staged = new Database(`${dbPath}.building-${process.pid}`, {
            readonly: true,
            fileMustExist: true,
          });
          stagedAssetCount = (staged.prepare("SELECT COUNT(*) AS count FROM assets").get() as {
            count: number;
          }).count;
          staged.close();
          throw new Error("boom");
        },
      }),
    ).rejects.toThrow("boom");

    expect(stagedAssetCount).toBe(0);
    const store = GraphStore.open(dbPath);
    expect(store.getNode(uppercaseGuid)?.path).toBe("Assets/Legacy.prefab");
    expect(store.getNode(uppercaseGuid.toLowerCase())).toBeNull();
    store.close();
  });
});
