#!/usr/bin/env node
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { extname } from "node:path";
import { GraphStore } from "../store/graph-store.js";
import { handleApi } from "./api.js";

const PUBLIC_DIR = new URL("./public/", import.meta.url);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

interface Args {
  dbPath: string;
  port: number;
}

export function parseServerArgs(argv: string[]): Args {
  let dbPath = "";
  let port = 7777;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--db") dbPath = argv[++i] ?? "";
    else if (argv[i] === "--port") port = Number.parseInt(argv[++i] ?? "7777", 10);
  }
  if (!dbPath) throw new Error("usage: asset-reference-mcp-web --db <index.db> [--port 7777]");
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

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    startServer(parseServerArgs(process.argv.slice(2)));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
