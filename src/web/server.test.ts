import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { parseServerArgs } from "./server.js";

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
});
