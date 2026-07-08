import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { runTool, type ToolCtx } from "./tools.js";
import { GraphStore } from "../store/graph-store.js";
import type { AssetNode, AssetType, Edge } from "../indexer/types.js";

const g = (c: string) => c.repeat(32);
function node(guid: string, path: string, assetType: AssetType = "Prefab"): AssetNode {
  return {
    guid, path, name: path.slice(path.lastIndexOf("/") + 1),
    assetType, origin: "project", packageId: null, fileSize: 100, mtime: 1, isBinary: false,
  };
}
function edge(fromGuid: string, toGuid: string): Edge {
  return { fromGuid, toGuid, refKind: "USES_MATERIAL", fileId: null, context: "m_Materials", count: 1 };
}

let dir: string;
let ctx: ToolCtx;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "mcp-tools-"));
  const dbPath = join(dir, "index.db");
  const store = GraphStore.open(dbPath);
  store.upsertNodes([
    node(g("a"), "Assets/Main.unity", "Scene"),
    node(g("b"), "Assets/P.prefab"),
    node(g("c"), "Assets/M.mat", "Material"),
    node(g("o"), "Assets/Orphan.png", "Texture"),
  ]);
  store.insertEdges([edge(g("a"), g("b")), edge(g("b"), g("c"))]);
  store.db.pragma("wal_checkpoint(TRUNCATE)");
  store.close();
  ctx = { dbPath };
});
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

describe("runTool", () => {
  test("get_overview returns counts", async () => {
    const o = (await runTool(ctx, "get_overview")) as { totalAssets: number };
    expect(o.totalAssets).toBe(4);
  });

  test("get_dependencies summarizes the forward subgraph", async () => {
    const r = (await runTool(ctx, "get_dependencies", { asset: "Assets/P.prefab", depth: -1 })) as {
      root: string; total: number;
    };
    expect(r.root).toBe("Assets/P.prefab");
    expect(r.total).toBe(1); // M.mat
  });

  test("find_references does impact analysis", async () => {
    const r = (await runTool(ctx, "find_references", { asset: "Assets/M.mat", depth: -1 })) as {
      total: number;
    };
    expect(r.total).toBe(2); // P.prefab, Main.unity
  });

  test("find_unused_assets flags orphans with the Addressables caveat", async () => {
    const r = (await runTool(ctx, "find_unused_assets")) as { total: number; note: string };
    expect(r.total).toBe(1); // Orphan.png (Scene is a root; P/M reachable)
    expect(r.note).toMatch(/Addressables/);
  });

  test("trace_path returns the chain", async () => {
    const r = (await runTool(ctx, "trace_path", { from: "Assets/Main.unity", to: "Assets/M.mat" })) as {
      hops: number; chain: string[];
    };
    expect(r.hops).toBe(2);
    expect(r.chain).toEqual(["Assets/Main.unity", "Assets/P.prefab", "Assets/M.mat"]);
  });

  test("index_status reports the store meta", async () => {
    const s = (await runTool(ctx, "index_status")) as { assetCount: number; schemaVersion: string };
    expect(s.assetCount).toBe(4);
    expect(s.schemaVersion).toBe("2");
  });

  test("read tools error cleanly when no index exists", async () => {
    const r = (await runTool({ dbPath: join(dir, "missing.db") }, "get_overview")) as {
      error: string;
    };
    expect(r.error).toBe("no-index");
  });

  test("unknown tool is reported", async () => {
    expect((await runTool(ctx, "nope")) as { error: string }).toMatchObject({ error: "unknown-tool" });
  });
});
