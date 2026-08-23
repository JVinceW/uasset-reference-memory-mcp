import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { listenOnFreePort, parseServerArgs } from "./server.js";

const DB_IN = join("/proj", ".asset-memory", "index.db");

describe("parseServerArgs", () => {
  test("resolves --project to the project's index, matching the MCP server", () => {
    expect(parseServerArgs(["--project", "/proj"]).dbPath).toBe(DB_IN);
  });

  test("still accepts an explicit --db path", () => {
    expect(parseServerArgs(["--db", "/elsewhere/custom.db"]).dbPath).toBe("/elsewhere/custom.db");
  });

  test("prefers --db when both are given, so an explicit file always wins", () => {
    const args = parseServerArgs(["--project", "/proj", "--db", "/elsewhere/custom.db"]);
    expect(args.dbPath).toBe("/elsewhere/custom.db");
  });

  test("defaults the port and accepts an override", () => {
    expect(parseServerArgs(["--project", "/proj"]).port).toBe(7777);
    expect(parseServerArgs(["--project", "/proj", "--port", "8080"]).port).toBe(8080);
  });

  test("rejects a non-numeric port instead of listening on NaN", () => {
    expect(() => parseServerArgs(["--project", "/proj", "--port", "abc"])).toThrow(/port/i);
  });

  test("requires one of --project or --db", () => {
    expect(() => parseServerArgs([])).toThrow(/--project|--db/);
  });

  test("reports a missing value rather than silently using the next flag", () => {
    expect(() => parseServerArgs(["--project", "--port", "8080"])).toThrow();
  });

  test("falls back to the project containing the working directory", () => {
    const root = mkdtempSync(join(tmpdir(), "uasset-cwd-"));
    mkdirSync(join(root, ".asset-memory"));
    const nested = join(root, "Assets", "Art");
    mkdirSync(nested, { recursive: true });
    try {
      expect(parseServerArgs([], nested).dbPath).toBe(join(root, ".asset-memory", "index.db"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("errors when the working directory is not inside a project", () => {
    const outside = mkdtempSync(join(tmpdir(), "uasset-nowhere-"));
    try {
      expect(() => parseServerArgs([], outside)).toThrow(/--project|--db/);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe("listenOnFreePort", () => {
  const open: ReturnType<typeof createServer>[] = [];
  const serve = () => {
    const s = createServer();
    open.push(s);
    return s;
  };
  afterAll(() => {
    for (const s of open) s.close();
  });

  test("binds the requested port when it is free", async () => {
    expect(await listenOnFreePort(serve(), 7912)).toBe(7912);
  });

  test("advances past a busy port instead of throwing EADDRINUSE", async () => {
    const first = await listenOnFreePort(serve(), 7913);
    const second = await listenOnFreePort(serve(), 7913);
    expect(first).toBe(7913);
    expect(second).toBeGreaterThan(first);
  });

  test("gives up with a clear message when the whole range is taken", async () => {
    await listenOnFreePort(serve(), 7920);
    await expect(listenOnFreePort(serve(), 7920, 1)).rejects.toThrow(/no free port/);
  });
});
