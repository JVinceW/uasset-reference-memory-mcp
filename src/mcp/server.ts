#!/usr/bin/env node
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { runTool, type ToolCtx } from "./tools.js";
import { isMainModule } from "../util/is-main.js";

const asset = z.string().describe("asset path, name, or guid");
const depth = z.number().int().optional().describe("hops to traverse; -1 = full closure (default 1)");

interface ToolDef {
  name: string;
  description: string;
  schema: z.ZodRawShape;
}

const TOOLS: ToolDef[] = [
  { name: "index_project", description: "Build/refresh the asset index for a Unity project.", schema: { path: z.string().optional(), force: z.boolean().optional() } },
  { name: "index_status", description: "Index location, counts, and last-indexed time.", schema: {} },
  { name: "get_dependencies", description: "Everything an asset depends on (forward).", schema: { asset, depth } },
  { name: "find_references", description: "Everything that references an asset (impact analysis).", schema: { asset, depth } },
  { name: "get_edges", description: "Raw reference edges (ref_kind, YAML context, fileId) between/for assets.", schema: { from: z.string().optional(), to: z.string().optional(), kind: z.string().optional(), limit: z.number().optional() } },
  { name: "trace_path", description: "Shortest reference chain between two assets.", schema: { from: z.string(), to: z.string() } },
  { name: "find_unused_assets", description: "Project assets unreachable from roots (cleanup candidates).", schema: { scope: z.string().optional(), includeScripts: z.boolean().optional(), addressableRoots: z.enum(["auto", "on", "off"]).optional().describe("use Addressable entries as roots (default: project config, else auto)") } },
  { name: "search_assets", description: "Search assets by name/type/path/origin and reference counts.", schema: { name: z.string().optional(), type: z.string().optional(), pathPrefix: z.string().optional(), origin: z.string().optional(), minRefs: z.number().optional(), maxRefs: z.number().optional(), limit: z.number().optional() } },
  { name: "get_overview", description: "Architecture overview: counts, hubs, broken refs.", schema: {} },
  { name: "export_graph_json", description: "Write a git-diffable JSON export of the whole graph (assets/edges/unresolved/addressables).", schema: { out: z.string().optional() } },
];

/** Build an MCP server exposing the asset-graph tools over the given context. */
export function createMcpServer(ctx: ToolCtx): McpServer {
  const server = new McpServer({ name: "asset-reference-mcp", version: "0.1.0" });
  for (const t of TOOLS) {
    server.registerTool(
      t.name,
      { description: t.description, inputSchema: t.schema },
      async (args: Record<string, unknown>) => {
        const result = await runTool(ctx, t.name, args);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      },
    );
  }
  return server;
}

function parseCtx(argv: string[]): ToolCtx {
  let dbPath = "";
  let projectRoot: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--db") dbPath = argv[++i] ?? "";
    else if (argv[i] === "--project") projectRoot = argv[++i];
  }
  if (!dbPath) {
    if (!projectRoot) throw new Error("usage: asset-reference-mcp-server --project <root> | --db <index.db>");
    dbPath = join(projectRoot, ".asset-memory", "index.db");
  }
  return { dbPath, projectRoot };
}

if (isMainModule(import.meta.url)) {
  const ctx = parseCtx(process.argv.slice(2));
  const server = createMcpServer(ctx);
  await server.connect(new StdioServerTransport());
  console.error(`unity-asset-reference-mcp server ready (db: ${ctx.dbPath})`);
}
