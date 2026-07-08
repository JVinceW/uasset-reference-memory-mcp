import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { scanProject, buildIgnore } from "./meta-scanner.js";

const meta = (guid: string) =>
  `fileFormatVersion: 2\nguid: ${guid}\nPrefabImporter:\n  externalObjects: {}\n`;

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "scan-ignore-"));
  await mkdir(join(root, "Assets"), { recursive: true });
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("buildIgnore", () => {
  test("combines built-in Unity rules with user glob patterns", () => {
    const ignore = buildIgnore({ ignore: ["*.bak"], ignoreDefaults: true });
    expect(ignore(".DS_Store", "Assets/.DS_Store")).toBe(true); // built-in
    expect(ignore("old.bak", "Assets/old.bak")).toBe(true); // user
    expect(ignore("Player.prefab", "Assets/Player.prefab")).toBe(false);
  });

  test("ignoreDefaults=false disables built-ins, keeping only user patterns", () => {
    const ignore = buildIgnore({ ignore: ["*.bak"], ignoreDefaults: false });
    expect(ignore(".DS_Store", "Assets/.DS_Store")).toBe(false); // built-in off
    expect(ignore("old.bak", "Assets/old.bak")).toBe(true); // user still applies
  });
});

describe("scanProject with a custom ignore", () => {
  test("skips assets matching a user pattern (no node, no warning)", async () => {
    await writeFile(join(root, "Assets/Keep.prefab"), "%YAML 1.1\n");
    await writeFile(join(root, "Assets/Keep.prefab.meta"), meta("a".repeat(32)));
    await writeFile(join(root, "Assets/Skip.prefab"), "%YAML 1.1\n");
    await writeFile(join(root, "Assets/Skip.prefab.meta"), meta("b".repeat(32)));

    const result = await scanProject(root, buildIgnore({ ignore: ["Skip.prefab"], ignoreDefaults: true }));
    const names = result.nodes.map((n) => n.name);
    expect(names).toContain("Keep.prefab");
    expect(names).not.toContain("Skip.prefab");
    expect(result.warnings.some((w) => w.path.includes("Skip"))).toBe(false);
  });
});
