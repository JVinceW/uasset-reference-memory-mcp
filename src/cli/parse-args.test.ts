import { describe, expect, test } from "vitest";
import { join } from "node:path";
import { parseArgs } from "./parse-args.js";

describe("parseArgs", () => {
  test("parses the index command with a project root", () => {
    const a = parseArgs(["index", "/proj"]);
    expect(a.command).toBe("index");
    expect(a.projectRoot).toBe("/proj");
    expect(a.dbPath).toBe(join("/proj", ".asset-memory", "index.db"));
    expect(a.force).toBe(false);
  });

  test("defaults project root to cwd when omitted", () => {
    const a = parseArgs(["index"], "/cwd");
    expect(a.projectRoot).toBe("/cwd");
    expect(a.dbPath).toBe(join("/cwd", ".asset-memory", "index.db"));
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

  test("parses the snapshot and restore commands like index", () => {
    const snap = parseArgs(["snapshot", "/proj"]);
    expect(snap.command).toBe("snapshot");
    expect(snap.dbPath).toBe(join("/proj", ".asset-memory", "index.db"));

    const restore = parseArgs(["restore", "/proj"]);
    expect(restore.command).toBe("restore");
  });

  test("index --snapshot sets the snapshot flag", () => {
    expect(parseArgs(["index", "/proj", "--snapshot"]).snapshot).toBe(true);
    expect(parseArgs(["index", "/proj"]).snapshot).toBe(false);
  });

  test("parses verify-index with its Unity export and report output paths", () => {
    const args = parseArgs(["verify-index", "/proj", "--verify", "/tmp/verify.json", "--db", "/tmp/index.db", "--out", "/tmp/report.json"]);
    expect(args.command).toBe("verify-index");
    expect(args.projectRoot).toBe("/proj");
    expect(args.verifyJsonPath).toBe("/tmp/verify.json");
    expect(args.dbPath).toBe("/tmp/index.db");
    expect(args.out).toBe("/tmp/report.json");
  });
});
