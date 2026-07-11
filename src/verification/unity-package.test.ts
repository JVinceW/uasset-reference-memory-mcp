import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const packageRoot = resolve(import.meta.dirname, "../../unity/com.jvincew.assetreferencememory");

describe("Unity verification package", () => {
  test("is an Editor-only UPM package with the documented package id", async () => {
    const manifest = JSON.parse(await readFile(resolve(packageRoot, "package.json"), "utf8")) as {
      name: string; version: string;
    };
    const assembly = JSON.parse(await readFile(resolve(packageRoot, "Editor/JVinceW.AssetReferenceMemory.Editor.asmdef"), "utf8")) as {
      includePlatforms: string[];
    };

    expect(manifest).toMatchObject({ name: "com.jvincew.assetreferencememory", version: "0.2.0" });
    expect(assembly.includePlatforms).toEqual(["Editor"]);
  });

  test("exports direct dependency GUIDs in schema version 1", async () => {
    const source = await readFile(resolve(packageRoot, "Editor/AssetReferenceMemoryVerifyExporter.cs"), "utf8");

    expect(source).toContain("AssetDatabase.GetDependencies(path, recursive: false)");
    expect(source).toContain("AssetDatabase.AssetPathToGUID(dependency)");
    expect(source).toContain("schemaVersion = 1");
    expect(source).toContain("File.Replace(temporaryPath, outputPath, null)");
  });
});
