import { mkdtemp, rm, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { exportSnapshot, importSnapshot, ensureLiveIndex, snapshotExists } from "./snapshot.js";
import { GraphStore } from "../store/graph-store.js";
import type { AssetNode, Edge } from "../indexer/types.js";

const g = (c: string) => c.repeat(32);
function node(guid: string, path: string): AssetNode {
  return { guid, path, name: path.slice(path.lastIndexOf("/") + 1), assetType: "Prefab", origin: "project", packageId: null, fileSize: 1, mtime: 1, isBinary: false };
}
function edge(f: string, t: string): Edge {
  return { fromGuid: f, toGuid: t, refKind: "USES_MATERIAL", fileId: null, context: "m", count: 1 };
}

let dir: string;
let dbPath: string;

function buildDb(): void {
  const store = GraphStore.open(dbPath);
  store.upsertNodes([node(g("a"), "Assets/A.prefab"), node(g("b"), "Assets/B.mat")]);
  store.insertEdges([edge(g("a"), g("b"))]);
  store.setMeta("indexed_at", "2026-07-08T00:00:00.000Z");
  store.db.pragma("wal_checkpoint(TRUNCATE)");
  store.close();
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "snap-"));
  dbPath = join(dir, "index.db");
});
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe("exportSnapshot", () => {
  test("writes a compressed snapshot, artifact.json, and .gitattributes", async () => {
    buildDb();
    const artifact = await exportSnapshot(dbPath, { toolVersion: "0.1.0", gitCommit: "abc123" });

    expect(existsSync(join(dir, "index.db.br"))).toBe(true);
    expect(existsSync(join(dir, "artifact.json"))).toBe(true);
    expect(existsSync(join(dir, ".gitattributes"))).toBe(true);

    expect(artifact.asset_count).toBe(2);
    expect(artifact.edge_count).toBe(1);
    expect(artifact.schema_version).toBe(3);
    expect(artifact.tool_version).toBe("0.1.0");
    expect(artifact.git_commit).toBe("abc123");
    expect(artifact.compressed_size).toBeLessThan(artifact.original_size);

    const written = JSON.parse(await readFile(join(dir, "artifact.json"), "utf8"));
    expect(written.asset_count).toBe(2);
    const attrs = await readFile(join(dir, ".gitattributes"), "utf8");
    expect(attrs).toMatch(/index\.db\.br .*binary/);
  });
});

describe("importSnapshot round-trip", () => {
  test("restores an identical, openable index", async () => {
    buildDb();
    await exportSnapshot(dbPath);
    await rm(dbPath); // simulate a fresh clone with only the committed snapshot

    await importSnapshot(dbPath);
    const store = GraphStore.open(dbPath);
    expect(store.assetCount()).toBe(2);
    expect(store.edgeCount()).toBe(1);
    expect(store.getMeta("indexed_at")).toBe("2026-07-08T00:00:00.000Z");
    store.close();
  });
});

describe("ensureLiveIndex", () => {
  test("imports from snapshot when the live index is missing", async () => {
    buildDb();
    await exportSnapshot(dbPath);
    await rm(dbPath);

    expect(snapshotExists(dbPath)).toBe(true);
    const imported = await ensureLiveIndex(dbPath);
    expect(imported).toBe(true);
    expect(existsSync(dbPath)).toBe(true);
  });

  test("does nothing when the live index already exists", async () => {
    buildDb();
    expect(await ensureLiveIndex(dbPath)).toBe(false);
  });

  test("does nothing when neither index nor snapshot exists", async () => {
    expect(await ensureLiveIndex(dbPath)).toBe(false);
  });
});
