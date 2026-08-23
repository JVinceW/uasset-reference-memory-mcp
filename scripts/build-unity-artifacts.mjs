// Builds the three Unity distribution formats for the GitHub release page.
//
// None of this needs a Unity Editor or licence: every asset in the package
// already carries a committed .meta with a stable GUID, which is the only thing
// a .unitypackage needs that Unity would otherwise generate.
//
//   .tgz           Package Manager -> Add package from tarball  (npm layout, package/ root)
//   .zip           unzip, then Add package from disk -> package.json
//   .unitypackage  Assets -> Import Package -> Custom Package   (lands under Assets/)
//
// The package versions independently of the npm package: it changes only when
// the Editor exporter changes, so the version here comes from its own
// package.json, never the root one.
//
//   node scripts/build-unity-artifacts.mjs [outDir]
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(repoRoot, "unity", "com.jvincew.assetreferencememory");
const outDir = process.argv[2] ?? join(repoRoot, "dist-unity");
// Where a .unitypackage import lands inside the consumer's project.
const IMPORT_ROOT = "Assets/AssetReferenceMemory";

const manifest = JSON.parse(await readFile(join(SRC, "package.json"), "utf8"));
const { name, version } = manifest;
if (!name || !version) throw new Error("unity package.json is missing name or version");

/** Every file and directory in the package, excluding .meta sidecars. */
async function collect(dir, acc = []) {
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.endsWith(".meta")) continue;
    const path = join(dir, entry.name);
    acc.push({ path, isDir: entry.isDirectory() });
    if (entry.isDirectory()) await collect(path, acc);
  }
  return acc;
}

const guidOf = async (metaPath) =>
  (await readFile(metaPath, "utf8")).match(/^guid:\s*([0-9a-f]{32})/m)?.[1];

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
const staging = await mkdtemp(join(tmpdir(), "unity-artifacts-"));

// --- .tgz: npm-style tarball, rooted at `package/` ------------------------
const tgzRoot = join(staging, "tgz", "package");
await cp(SRC, tgzRoot, { recursive: true });
const tgzPath = join(outDir, `${name}-${version}.tgz`);
execFileSync("tar", ["-czf", tgzPath, "package"], { cwd: join(staging, "tgz") });

// --- .zip: plain folder, added from disk ----------------------------------
const zipRoot = join(staging, "zip", name);
await cp(SRC, zipRoot, { recursive: true });
const zipPath = join(outDir, `${name}-${version}.zip`);
execFileSync("zip", ["-qr", zipPath, name], { cwd: join(staging, "zip") });

// --- .unitypackage: gzipped tar of <guid>/{asset,asset.meta,pathname} -----
// The package folder itself is an entry too, so its sibling .meta is included.
const entries = [{ path: SRC, isDir: true }, ...(await collect(SRC))];
const upRoot = join(staging, "unitypackage");
let written = 0;
for (const { path, isDir } of entries) {
  const metaPath = `${path}.meta`;
  const guid = await stat(metaPath).then(() => guidOf(metaPath), () => undefined);
  if (!guid) {
    // Without a GUID the entry cannot be represented and Unity would simply
    // not import it. Fail rather than ship a package missing files.
    throw new Error(`no .meta guid for ${relative(repoRoot, path)} — .unitypackage would silently drop it`);
  }
  const entryDir = join(upRoot, guid);
  await mkdir(entryDir, { recursive: true });
  const rel = relative(SRC, path).split("\\").join("/");
  await writeFile(join(entryDir, "pathname"), rel ? `${IMPORT_ROOT}/${rel}` : IMPORT_ROOT);
  await cp(metaPath, join(entryDir, "asset.meta"));
  if (!isDir) await cp(path, join(entryDir, "asset"));
  written += 1;
}
const unityPkgPath = join(outDir, `${name}-${version}.unitypackage`);
execFileSync("tar", ["-czf", unityPkgPath, "."], { cwd: upRoot });

await rm(staging, { recursive: true, force: true });
console.log(`unity artifacts for ${name}@${version} -> ${outDir}`);
for (const p of [tgzPath, zipPath, unityPkgPath]) {
  console.log(`  ${relative(outDir, p)}  (${((await stat(p)).size / 1024).toFixed(1)} KB)`);
}
console.log(`  ${written} GUID entries in the .unitypackage`);
