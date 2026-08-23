#!/usr/bin/env node
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { isMainModule } from "../util/is-main.js";
import { extname, join } from "node:path";
import { GraphStore } from "../store/graph-store.js";
import { handleApi } from "./api.js";
import { ensureLiveIndex } from "../snapshot/snapshot.js";

const PUBLIC_DIR = new URL("./public/", import.meta.url);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

interface Args {
  dbPath: string;
  port: number;
}

const USAGE =
  "usage: unity-asset-reference-mcp-web --project <root> | --db <index.db> [--port 7777]";

/** A flag's value, rejecting a missing one rather than consuming the next flag. */
function flagValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) throw new Error(`${flag} expects a value`);
  return value;
}

export function parseServerArgs(argv: string[]): Args {
  let dbPath = "";
  let projectRoot = "";
  let port = 7777;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--db") dbPath = flagValue(argv, ++i, "--db");
    else if (arg === "--project") projectRoot = flagValue(argv, ++i, "--project");
    else if (arg === "--port") {
      const raw = flagValue(argv, ++i, "--port");
      port = Number.parseInt(raw, 10);
      if (!Number.isFinite(port)) throw new Error(`--port expects a number, got: ${raw}`);
    }
  }
  // `--project <root>` mirrors the MCP server, so both binaries take the same
  // argument and neither asks the user to spell out .asset-memory/index.db.
  if (!dbPath) {
    if (!projectRoot) throw new Error(USAGE);
    dbPath = join(projectRoot, ".asset-memory", "index.db");
  }
  return { dbPath, port };
}

export function startServer(args: Args): ReturnType<typeof createServer> {
  const store = GraphStore.open(args.dbPath);

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://localhost:${args.port}`);
      if (url.pathname.startsWith("/api/")) {
        const params: Record<string, string> = {};
        for (const [k, v] of url.searchParams) params[k] = v;
        const { status, body } = handleApi(store, url.pathname, params);
        res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(body));
        return;
      }
      await serveStatic(url.pathname, res);
    } catch (err) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  });

  server.listen(args.port, () => {
    console.log(`asset graph viewer → http://localhost:${args.port}  (db: ${args.dbPath})`);
  });
  return server;
}

async function serveStatic(pathname: string, res: import("node:http").ServerResponse): Promise<void> {
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const fileUrl = new URL(rel, PUBLIC_DIR);
  // Prevent path traversal outside the public dir.
  if (!fileURLToPath(fileUrl).startsWith(fileURLToPath(PUBLIC_DIR))) {
    res.writeHead(403).end("forbidden");
    return;
  }
  try {
    const data = await readFile(fileUrl);
    res.writeHead(200, { "content-type": MIME[extname(rel)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("not found");
  }
}

if (isMainModule(import.meta.url)) {
  (async () => {
    const args = parseServerArgs(process.argv.slice(2));
    await ensureLiveIndex(args.dbPath); // restore from snapshot if the live index is absent
    startServer(args);
  })().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
