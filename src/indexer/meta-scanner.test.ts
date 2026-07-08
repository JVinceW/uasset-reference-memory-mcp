import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { scanProject } from "./meta-scanner.js";
import type { AssetNode, ScanResult } from "./types.js";

/** Build a `.meta` body with a guid and importer/folder marker. */
function meta(guid: string, opts: { folder?: boolean; importer?: string } = {}): string {
  const lines = [`fileFormatVersion: 2`, `guid: ${guid}`];
  if (opts.folder) lines.push("folderAsset: yes", "DefaultImporter:", "  externalObjects: {}");
  else lines.push(`${opts.importer ?? "DefaultImporter"}:`, "  externalObjects: {}");
  return lines.join("\n") + "\n";
}

let root: string;
let result: ScanResult;

const byName = (name: string): AssetNode | undefined =>
  result.nodes.find((n) => n.name === name);

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "asset-scan-"));

  // Assets/Prefabs/Player.prefab (+ folder meta for Prefabs)
  await mkdir(join(root, "Assets/Prefabs"), { recursive: true });
  await writeFile(join(root, "Assets/Prefabs.meta"), meta("a".repeat(32), { folder: true }));
  await writeFile(join(root, "Assets/Prefabs/Player.prefab"), "%YAML 1.1\n--- !u!1 &1\n");
  await writeFile(
    join(root, "Assets/Prefabs/Player.prefab.meta"),
    meta("b".repeat(32), { importer: "PrefabImporter" }),
  );

  // Assets/Materials/body.mat (+ folder meta for Materials)
  await mkdir(join(root, "Assets/Materials"), { recursive: true });
  await writeFile(join(root, "Assets/Materials.meta"), meta("c".repeat(32), { folder: true }));
  await writeFile(join(root, "Assets/Materials/body.mat"), "%YAML 1.1\n--- !u!21 &2\n");
  await writeFile(
    join(root, "Assets/Materials/body.mat.meta"),
    meta("d".repeat(32), { importer: "NativeFormatImporter" }),
  );

  // Orphan meta (no asset file) -> orphan-meta warning
  await writeFile(join(root, "Assets/Orphan.prefab.meta"), meta("e".repeat(32)));

  // Asset file with no meta -> missing-meta warning
  await writeFile(join(root, "Assets/NoMeta.txt"), "loose file");

  // Non-asset files that legitimately have no .meta (should be ignored, not warned)
  await mkdir(join(root, "Packages"), { recursive: true });
  await writeFile(join(root, "Assets/.DS_Store"), "junk");
  await writeFile(join(root, "Assets/.signature.p7s"), "sig");
  await writeFile(join(root, "Packages/manifest.json"), "{}");
  await writeFile(join(root, "Packages/packages-lock.json"), "{}");

  // Packages/com.foo.bar/Widget.asset -> origin package
  await mkdir(join(root, "Packages/com.foo.bar"), { recursive: true });
  await writeFile(join(root, "Packages/com.foo.bar/Widget.asset"), "%YAML 1.1\n--- !u!114 &3\n");
  await writeFile(
    join(root, "Packages/com.foo.bar/Widget.asset.meta"),
    meta("f".repeat(32), { importer: "NativeFormatImporter" }),
  );

  result = await scanProject(root);
}, 20_000);

afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

describe("scanProject", () => {
  test("produces one node per asset that has a .meta", () => {
    expect(result.nodes.map((n) => n.name).sort()).toEqual(
      ["Materials", "Player.prefab", "Prefabs", "Widget.asset", "body.mat"].sort(),
    );
  });

  test("classifies asset types including folders", () => {
    expect(byName("Player.prefab")?.assetType).toBe("Prefab");
    expect(byName("body.mat")?.assetType).toBe("Material");
    expect(byName("Prefabs")?.assetType).toBe("Folder");
    expect(byName("Widget.asset")?.assetType).toBe("ScriptableObject");
  });

  test("keys nodes by the guid from the .meta", () => {
    expect(byName("Player.prefab")?.guid).toBe("b".repeat(32));
  });

  test("records project-relative forward-slash paths", () => {
    expect(byName("Player.prefab")?.path).toBe("Assets/Prefabs/Player.prefab");
  });

  test("captures file_size and mtime for files", () => {
    const node = byName("Player.prefab")!;
    expect(node.fileSize).toBeGreaterThan(0);
    expect(node.mtime).toBeGreaterThan(0);
  });

  test("marks YAML assets non-binary and folders binary", () => {
    expect(byName("Player.prefab")?.isBinary).toBe(false);
    expect(byName("Prefabs")?.isBinary).toBe(true);
  });

  test("classifies package origin", () => {
    expect(byName("Widget.asset")?.origin).toBe("package");
    expect(byName("Player.prefab")?.origin).toBe("project");
  });

  test("parses package_id for package assets and leaves it null for project assets", () => {
    expect(byName("Widget.asset")?.packageId).toBe("com.foo.bar");
    expect(byName("Player.prefab")?.packageId).toBeNull();
  });

  test("warns on a meta without its asset (orphan-meta)", () => {
    expect(
      result.warnings.some(
        (w) => w.kind === "orphan-meta" && w.path.endsWith("Orphan.prefab"),
      ),
    ).toBe(true);
  });

  test("warns on an asset without its meta (missing-meta)", () => {
    expect(
      result.warnings.some(
        (w) => w.kind === "missing-meta" && w.path.endsWith("NoMeta.txt"),
      ),
    ).toBe(true);
  });

  test("does not warn (or node) on ignored non-asset files", () => {
    const noisy = [".DS_Store", ".signature.p7s", "manifest.json", "packages-lock.json"];
    for (const n of noisy) {
      expect(result.warnings.some((w) => w.path.endsWith(n))).toBe(false);
      expect(result.nodes.some((node) => node.name === n)).toBe(false);
    }
  });
});
