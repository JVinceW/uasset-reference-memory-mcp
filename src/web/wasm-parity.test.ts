import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import initSqlJs from "sql.js";
import { GraphStore } from "../store/graph-store.js";
import { handleApi } from "./api.js";
import type { QueryDb } from "../query/db.js";
import type { AssetNode, AssetType, Edge } from "../indexer/types.js";

const g = (c: string) => c.repeat(32);
function node(guid: string, path: string, assetType: AssetType = "Prefab"): AssetNode {
  return {
    guid, path, name: path.slice(path.lastIndexOf("/") + 1),
    assetType, origin: "project", packageId: null, fileSize: 1, mtime: 1, isBinary: false,
  };
}
function edge(fromGuid: string, toGuid: string): Edge {
  return { fromGuid, toGuid, refKind: "USES_MATERIAL", fileId: null, context: "m_Materials", count: 1 };
}

// Wrap a sql.js database as the same QueryDb interface GraphStore implements.
function wasmDb(db: import("sql.js").Database): QueryDb {
  return {
    all(sql, params = []) {
      const stmt = db.prepare(sql);
      stmt.bind(params as never[]);
      const rows: Record<string, unknown>[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    },
  };
}

describe("query layer parity: better-sqlite3 vs sql.js (WASM)", () => {
  test("handleApi returns identical results on both engines", async () => {
    const store = GraphStore.open(":memory:");
    store.upsertNodes([
      node(g("a"), "Assets/A.prefab"),
      node(g("b"), "Assets/B.mat", "Material"),
      node(g("c"), "Assets/C.png", "Texture"),
    ]);
    store.insertEdges([edge(g("a"), g("b")), edge(g("b"), g("c"))]);

    const SQL = await initSqlJs({
      locateFile: () =>
        fileURLToPath(new URL("../../node_modules/sql.js/dist/sql-wasm.wasm", import.meta.url)),
    });
    const wasm = wasmDb(new SQL.Database(store.db.serialize()));

    for (const [path, params] of [
      ["/api/overview", {}],
      ["/api/search", { type: "Material" }],
      ["/api/neighborhood", { ref: "Assets/A.prefab", dir: "deps", depth: "2" }],
      ["/api/trace", { from: "Assets/A.prefab", to: "Assets/C.png" }],
    ] as const) {
      const server = handleApi(store, path, params);
      const browser = handleApi(wasm, path, params);
      expect(browser.status, path).toBe(server.status);
      expect(browser.body, path).toEqual(server.body);
    }
    store.close();
  });
});
