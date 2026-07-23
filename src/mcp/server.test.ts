import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "./server.js";
import { GraphStore } from "../store/graph-store.js";
import type { AssetNode, AssetType, Edge } from "../indexer/types.js";

const g = (c: string) => c.repeat(32);
function node(guid: string, path: string, t: AssetType = "Prefab"): AssetNode {
  return { guid, path, name: path.slice(path.lastIndexOf("/") + 1), assetType: t, origin: "project", packageId: null, fileSize: 1, mtime: 1, isBinary: false };
}
function edge(f: string, to: string): Edge {
  return { fromGuid: f, toGuid: to, refKind: "USES_MATERIAL", fileId: null, context: "m", count: 1 };
}

let dir: string;
let client: Client;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "mcp-server-"));
  const dbPath = join(dir, "index.db");
  const store = GraphStore.open(dbPath);
  store.upsertNodes([node(g("a"), "Assets/P.prefab"), node(g("b"), "Assets/M.mat", "Material")]);
  store.insertEdges([edge(g("a"), g("b"))]);
  store.db.pragma("wal_checkpoint(TRUNCATE)");
  store.close();

  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await createMcpServer({ dbPath }).connect(serverT);
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientT);
});
afterAll(async () => {
  await client?.close();
  await rm(dir, { recursive: true, force: true });
});

describe("MCP server", () => {
  test("lists the asset-graph tools", async () => {
    const tools = (await client.listTools()).tools;
    const names = tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "index_project", "index_status", "get_dependencies", "find_references",
        "trace_path", "find_unused_assets", "search_assets", "get_overview",
        "verify_index",
        "get_addressable_info", "search_addressables", "list_addressable_groups",
      ]),
    );
    expect(names).toHaveLength(15);

    const indexProjectTool = tools.find((tool) => tool.name === "index_project");
    expect(indexProjectTool?.description).toMatch(/incremental/i);
    expect(indexProjectTool?.description).toMatch(/force.*guaranteed/i);

    const indexStatusTool = tools.find((tool) => tool.name === "index_status");
    expect(indexStatusTool?.description).toMatch(/stored/i);
    expect(indexStatusTool?.description).toMatch(/does not.*fresh/i);

    const getAddressableInfo = tools.find((tool) => tool.name === "get_addressable_info");
    expect(getAddressableInfo?.inputSchema).toMatchObject({
      type: "object",
      properties: { asset: { type: "string" } },
      required: ["asset"],
    });

    const searchAddressables = tools.find((tool) => tool.name === "search_addressables");
    expect(searchAddressables?.inputSchema).toMatchObject({
      type: "object",
      properties: {
        query: { type: "string" },
        group: { type: "string" },
        label: { type: "string" },
        pathPrefix: { type: "string" },
        type: { type: "string" },
        reachableOnlyBecauseAddressable: { type: "boolean" },
        limit: { type: "integer", minimum: 1, maximum: 200 },
      },
    });
    expect(searchAddressables?.inputSchema).not.toHaveProperty("required");
  });

  test.each([
    ["get_addressable_info", {}],
    ["search_addressables", { limit: 0 }],
    ["search_addressables", { limit: 201 }],
    ["search_addressables", { limit: 1.5 }],
  ])("rejects invalid %s arguments at the MCP boundary", async (name, args) => {
    const result = await client.callTool({ name: name as string, arguments: args });
    expect(result.isError).toBe(true);
    expect((result.content as { type: string; text: string }[])[0]!.text).toContain(
      "Input validation error",
    );
  });

  test("calls get_dependencies and returns JSON content", async () => {
    const res = await client.callTool({ name: "get_dependencies", arguments: { asset: "Assets/P.prefab", depth: -1 } });
    const text = (res.content as { type: string; text: string }[])[0]!.text;
    const data = JSON.parse(text);
    expect(data.root).toBe("Assets/P.prefab");
    expect(data.total).toBe(1);
  });
});
