// Release artifacts are built by a tag-triggered workflow, so a break here
// surfaces only at release time unless it is exercised by the suite.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = (script: string, out: string) =>
  execFileSync("node", [join(repoRoot, "scripts", script), out], { cwd: repoRoot, encoding: "utf8" });
const listTar = (p: string) => execFileSync("tar", ["-tzf", p], { encoding: "utf8" }).trim().split("\n");

const unityPkg = JSON.parse(
  readFileSync(join(repoRoot, "unity", "com.jvincew.assetreferencememory", "package.json"), "utf8"),
) as { name: string; version: string };

describe("unity release artifacts", () => {
  let out: string;
  let files: string[];
  beforeAll(() => {
    out = mkdtempSync(join(tmpdir(), "unity-artifacts-test-"));
    run("build-unity-artifacts.mjs", out);
    files = readdirSync(out);
  });
  afterAll(() => rmSync(out, { recursive: true, force: true }));

  test("emits all three formats named by the unity package version", () => {
    const { name, version } = unityPkg;
    expect(files.sort()).toEqual(
      [`${name}-${version}.tgz`, `${name}-${version}.unitypackage`, `${name}-${version}.zip`].sort(),
    );
  });

  test("the tarball is rooted at package/, which UPM requires", () => {
    const entries = listTar(join(out, `${unityPkg.name}-${unityPkg.version}.tgz`));
    expect(entries.every((e) => e === "package/" || e.startsWith("package/"))).toBe(true);
    expect(entries).toContain("package/package.json");
  });

  test("every .unitypackage entry is a guid folder carrying pathname and asset.meta", () => {
    const entries = listTar(join(out, `${unityPkg.name}-${unityPkg.version}.unitypackage`));
    const guids = new Set(
      entries.map((e) => e.match(/^\.\/([0-9a-f]{32})\//)?.[1]).filter((g): g is string => Boolean(g)),
    );
    expect(guids.size).toBeGreaterThan(0);
    for (const guid of guids) {
      expect(entries).toContain(`./${guid}/pathname`);
      expect(entries).toContain(`./${guid}/asset.meta`);
    }
  });

  test("imports under Assets/, since a .unitypackage is not a UPM package", () => {
    // Extract rather than filter: `tar --wildcards` is GNU-only and absent on
    // the BSD tar shipped with macOS.
    const dir = mkdtempSync(join(tmpdir(), "unitypackage-extract-"));
    try {
      execFileSync("tar", ["-xzf", join(out, `${unityPkg.name}-${unityPkg.version}.unitypackage`), "-C", dir]);
      const pathnames = readdirSync(dir)
        .filter((e) => /^[0-9a-f]{32}$/.test(e))
        .map((guid) => readFileSync(join(dir, guid, "pathname"), "utf8"));
      expect(pathnames.length).toBeGreaterThan(0);
      expect(pathnames.every((p) => p.startsWith("Assets/AssetReferenceMemory"))).toBe(true);
      expect(pathnames.some((p) => p.includes("Packages/"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("carries every packaged file, including the docs that have no importer", () => {
    const entries = listTar(join(out, `${unityPkg.name}-${unityPkg.version}.tgz`));
    for (const name of ["README.md", "CHANGELOG.md", "LICENSE.md", "package.json"]) {
      expect(entries).toContain(`package/${name}`);
    }
  });
});

describe("static viewer artifact", () => {
  let out: string;
  beforeAll(() => {
    out = mkdtempSync(join(tmpdir(), "static-viewer-test-"));
    run("build-static-viewer.mjs", out);
  });
  afterAll(() => rmSync(out, { recursive: true, force: true }));

  test("emits a zip named by the npm package version", () => {
    const version = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")).version as string;
    expect(readdirSync(out)).toContain(`asset-graph-viewer-static-${version}.zip`);
  });

  test("bundles the WASM runtime the server-less flavor needs", () => {
    const version = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")).version as string;
    const listed = execFileSync("unzip", ["-Z1", join(out, `asset-graph-viewer-static-${version}.zip`)], {
      encoding: "utf8",
    });
    for (const f of ["viewer.html", "vendor/sql-wasm.wasm", "vendor/cytoscape.min.js", "app.js"]) {
      expect(listed).toContain(f);
    }
  });
});
