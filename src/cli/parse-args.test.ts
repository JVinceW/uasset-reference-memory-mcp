import { describe, expect, test } from "vitest";
import { parseArgs } from "./parse-args.js";

describe("parseArgs", () => {
  test("parses the index command with a project root", () => {
    const a = parseArgs(["index", "/proj"]);
    expect(a.command).toBe("index");
    expect(a.projectRoot).toBe("/proj");
    expect(a.dbPath).toBe("/proj/.asset-memory/index.db");
    expect(a.force).toBe(false);
  });

  test("defaults project root to cwd when omitted", () => {
    const a = parseArgs(["index"], "/cwd");
    expect(a.projectRoot).toBe("/cwd");
    expect(a.dbPath).toBe("/cwd/.asset-memory/index.db");
  });

  test("honors --force and --db and --unity in any order", () => {
    const a = parseArgs(["index", "--force", "--db", "/x/y.db", "--unity", "2022.3", "/proj"]);
    expect(a.force).toBe(true);
    expect(a.dbPath).toBe("/x/y.db");
    expect(a.unityVersion).toBe("2022.3");
    expect(a.projectRoot).toBe("/proj");
  });

  test("returns help command for empty or unknown input", () => {
    expect(parseArgs([]).command).toBe("help");
    expect(parseArgs(["wat"]).command).toBe("help");
  });
});
