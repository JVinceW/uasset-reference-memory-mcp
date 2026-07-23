import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { discoverScanRoots } from "./package-sources.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "upm-package-sources-"));
  await mkdir(join(root, "Assets"), { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function writeProjectManifest(dependencies: Record<string, unknown>): Promise<void> {
  await mkdir(join(root, "Packages"), { recursive: true });
  await writeFile(join(root, "Packages", "manifest.json"), JSON.stringify({ dependencies }));
}

async function writeExternalPackage(folder: string, name: string): Promise<string> {
  const packageRoot = join(root, "..", folder);
  await mkdir(packageRoot, { recursive: true });
  await writeFile(join(packageRoot, "package.json"), JSON.stringify({ name, version: "1.0.0" }));
  return packageRoot;
}

async function writeEmbeddedPackage(name: string): Promise<string> {
  const packageRoot = join(root, "Packages", name);
  await mkdir(packageRoot, { recursive: true });
  await writeFile(join(packageRoot, "package.json"), JSON.stringify({ name, version: "1.0.0" }));
  return packageRoot;
}

async function writeCachedPackage(folder: string, name: string): Promise<string> {
  const packageRoot = join(root, "Library", "PackageCache", folder);
  await mkdir(packageRoot, { recursive: true });
  await writeFile(join(packageRoot, "package.json"), JSON.stringify({ name, version: "1.0.0" }));
  return packageRoot;
}

describe("discoverScanRoots", () => {
  test("discovers a relative external local package with a canonical virtual root", async () => {
    const external = join(root, "..", "modules", "com.company.gameplay");
    await mkdir(external, { recursive: true });
    await writeFile(join(external, "package.json"), JSON.stringify({ name: "com.company.gameplay", version: "1.0.0" }));
    await writeProjectManifest({ "com.company.gameplay": "file:../../modules/com.company.gameplay" });

    const result = await discoverScanRoots(root);

    expect(result.roots).toContainEqual({ physicalRoot: external, virtualRoot: "Packages/com.company.gameplay", origin: "package", packageId: "com.company.gameplay" });
    expect(result.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(result.fingerprint).not.toContain(external);
  });

  test("discovers an absolute file directory", async () => {
    const external = await writeExternalPackage("absolute-package", "com.company.gameplay");
    await writeProjectManifest({ "com.company.gameplay": `file:${external}` });

    await expect(discoverScanRoots(root)).resolves.toMatchObject({ roots: expect.arrayContaining([expect.objectContaining({ physicalRoot: external, virtualRoot: "Packages/com.company.gameplay" })]) });
    expect(isAbsolute(external)).toBe(true);
  });

  test("discovers a local package described only by the lockfile", async () => {
    const external = await writeExternalPackage("lock-package", "com.company.gameplay");
    await writeProjectManifest({});
    await writeFile(join(root, "Packages", "packages-lock.json"), JSON.stringify({ dependencies: { "com.company.gameplay": { source: "local", version: `file:${external}` } } }));

    await expect(discoverScanRoots(root)).resolves.toMatchObject({ roots: expect.arrayContaining([expect.objectContaining({ physicalRoot: external, packageId: "com.company.gameplay" })]) });
  });

  test("warns and skips a local package whose manifest name does not match", async () => {
    const external = await writeExternalPackage("declared-folder", "com.company.other");
    await writeProjectManifest({ "com.company.gameplay": `file:${external}` });

    const result = await discoverScanRoots(root);

    expect(result.roots.some((scanRoot) => scanRoot.virtualRoot === "Packages/com.company.gameplay")).toBe(false);
    expect(result.warnings).toContainEqual(expect.objectContaining({ kind: "package-discovery", path: "Packages/com.company.gameplay", message: expect.stringMatching(/name mismatch/i) }));
  });

  test("prefers embedded, then external, then cache for one package name", async () => {
    await writeEmbeddedPackage("com.company.gameplay");
    await writeExternalPackage("external-package", "com.company.gameplay");
    await writeProjectManifest({ "com.company.gameplay": "file:../../external-package" });
    await writeCachedPackage("com.company.gameplay@1.0.0", "com.company.gameplay");

    const result = await discoverScanRoots(root);
    const matching = result.roots.filter((scanRoot) => scanRoot.packageId === "com.company.gameplay");

    expect(matching).toHaveLength(1);
    expect(matching[0]!.physicalRoot).toBe(join(root, "Packages", "com.company.gameplay"));
  });

  test("uses a direct manifest value once when the lockfile repeats the package", async () => {
    const manifestPackage = await writeExternalPackage("manifest-package", "com.company.gameplay");
    const lockPackage = await writeExternalPackage("lock-package-repeat", "com.company.gameplay");
    await writeProjectManifest({ "com.company.gameplay": `file:${manifestPackage}` });
    await writeFile(join(root, "Packages", "packages-lock.json"), JSON.stringify({ dependencies: { "com.company.gameplay": { source: "local", version: `file:${lockPackage}` } } }));

    const result = await discoverScanRoots(root);
    expect(result.roots).toContainEqual(expect.objectContaining({ physicalRoot: manifestPackage, packageId: "com.company.gameplay" }));
    expect(result.roots).not.toContainEqual(expect.objectContaining({ physicalRoot: lockPackage }));
  });

  test.each([
    ["missing package.json", async () => { const packageRoot = join(root, "..", "no-package-json"); await mkdir(packageRoot, { recursive: true }); return packageRoot; }],
    ["malformed package.json", async () => { const packageRoot = join(root, "..", "bad-package-json"); await mkdir(packageRoot, { recursive: true }); await writeFile(join(packageRoot, "package.json"), "{"); return packageRoot; }],
  ])("warns and skips an external package with %s", async (_name, createPackage) => {
    const external = await createPackage();
    await writeProjectManifest({ "com.company.gameplay": `file:${external}` });

    const result = await discoverScanRoots(root);
    expect(result.roots).not.toContainEqual(expect.objectContaining({ physicalRoot: external }));
    expect(result.warnings).toContainEqual(expect.objectContaining({ kind: "package-discovery", path: "Packages/com.company.gameplay" }));
  });

  test.each([
    ["missing manifest", undefined],
    ["malformed manifest", "{"],
  ])("warns for a %s", async (_name, contents) => {
    if (contents !== undefined) {
      await mkdir(join(root, "Packages"), { recursive: true });
      await writeFile(join(root, "Packages", "manifest.json"), contents);
    }

    const result = await discoverScanRoots(root);
    expect(result.warnings).toContainEqual(expect.objectContaining({ kind: "package-discovery", path: "Packages/manifest.json" }));
  });

  test("warns for a malformed lockfile", async () => {
    await writeProjectManifest({});
    await writeFile(join(root, "Packages", "packages-lock.json"), "{");

    await expect(discoverScanRoots(root)).resolves.toMatchObject({ warnings: expect.arrayContaining([expect.objectContaining({ kind: "package-discovery", path: "Packages/packages-lock.json" })]) });
  });

  test.each([
    ["local tarball", "file:../archives/com.company.gameplay.tgz"],
    ["file URL", "file://example.com/com.company.gameplay.git"],
  ])("rejects a %s manifest dependency", async (_name, value) => {
    await writeProjectManifest({ "com.company.gameplay": value });

    const result = await discoverScanRoots(root);
    expect(result.roots).not.toContainEqual(expect.objectContaining({ packageId: "com.company.gameplay" }));
  });

  test("excludes a cache directory when an active external source has the package name", async () => {
    const external = await writeExternalPackage("external-preferred", "com.company.gameplay");
    await writeProjectManifest({ "com.company.gameplay": `file:${external}` });
    const cached = await writeCachedPackage("com.company.gameplay@1.0.0", "com.company.gameplay");

    const result = await discoverScanRoots(root);
    expect(result.roots).toContainEqual(expect.objectContaining({ physicalRoot: external }));
    expect(result.roots).not.toContainEqual(expect.objectContaining({ physicalRoot: cached }));
  });
});
