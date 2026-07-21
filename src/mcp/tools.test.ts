import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
    node(g("d"), "Assets/UI/Profile.prefab"),
  ]);
  store.insertEdges([edge(g("a"), g("b")), edge(g("b"), g("c"))]);
  store.replaceAddressableGroups([{
    groupGuid: g("e"),
    assetGuid: g("f"),
    name: "UI Remote",
    path: "Assets/AddressableAssetsData/AssetGroups/UI.asset",
    entries: [{ guid: g("d"), address: "ui/profile", readOnly: false, labels: ["remote"] }],
  }]);
  store.db.pragma("wal_checkpoint(TRUNCATE)");
  store.close();
  ctx = { dbPath };
});
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

describe("runTool", () => {
  test("get_overview returns counts", async () => {
    const o = (await runTool(ctx, "get_overview")) as { totalAssets: number };
    expect(o.totalAssets).toBe(5);
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
    expect(r.note).toMatch(/Addressable/);
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
    expect(s.assetCount).toBe(5);
    expect(s.schemaVersion).toBe("3");
  });

  test("verify_index returns a bounded summary and writes the full report", async () => {
    const verifyJsonPath = join(dir, "verify.json");
    await writeFile(verifyJsonPath, JSON.stringify({
      schemaVersion: 1,
      unityVersion: "2022.3.0f1",
      exportedAt: "2026-07-12T00:00:00.000Z",
      assets: [{
        path: "Assets/P.prefab",
        guid: g("b"),
        dependencies: [{ path: "Assets/M.mat", guid: g("c") }],
      }],
    }));

    const result = (await runTool(ctx, "verify_index", { verifyJsonPath })) as {
      status: string; reportPath: string; matchedCount: number; fullDetailsInReport: boolean;
    };

    expect(result).toMatchObject({ status: "clean", matchedCount: 1, fullDetailsInReport: true });
    expect(result.reportPath).toBe(join(dir, "verify-report.json"));
  });

  test("get_addressable_info returns membership and reachability", async () => {
    expect(await runTool(ctx, "get_addressable_info", { asset: "ui/profile" })).toMatchObject({
      status: "found",
      isAddressable: true,
      reachableOnlyBecauseAddressable: true,
    });
  });

  test("search_addressables returns filtered entries", async () => {
    expect(await runTool(ctx, "search_addressables", { group: "UI", label: "remote" })).toMatchObject({
      total: 1,
      truncated: false,
    });
  });

  test("list_addressable_groups returns group inventory", async () => {
    expect(await runTool(ctx, "list_addressable_groups")).toMatchObject({
      total: 1,
      groups: [{ name: "UI Remote", entryCount: 1 }],
    });
  });

  test.each(["get_addressable_info", "search_addressables", "list_addressable_groups"])(
    "%s rejects an outdated index before opening it",
    async (toolName) => {
      const oldDbPath = join(dir, `${toolName}.db`);
      const oldStore = GraphStore.open(oldDbPath);
      oldStore.setMeta("schema_version", "2");
      oldStore.db.pragma("wal_checkpoint(TRUNCATE)");
      oldStore.close();

      expect(await runTool({ dbPath: oldDbPath }, toolName, { asset: "ui/profile" })).toEqual({
        error: "schema-mismatch",
        expected: 3,
        actual: 2,
        message: "index schema 2 is incompatible with this tool; run index_project to rebuild schema 3",
      });
    },
  );

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
