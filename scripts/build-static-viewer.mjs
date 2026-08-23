// Assembles the server-less viewer into a zip for the GitHub release page.
//
// This flavor opens straight from the filesystem and reads a .db in the browser
// through sql.js, so it needs no Node, no install, and no running server. That
// also means it does not belong inside the npm package: `src/web/static-viewer/`
// is deliberately outside the directory copy-public.mjs ships, keeping ~706 KB
// of WASM out of every `npm install` while the artifact stays downloadable.
//
// Shared files (style.css, app.js, cytoscape) still live under src/web/public/
// because the bundled legacy viewer needs them too, so this pulls from both.
//
//   node scripts/build-static-viewer.mjs [outDir]
import { cp, mkdir, rm, readFile, access } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = process.argv[2] ?? join(repoRoot, "dist-static-viewer");
const NAME = "asset-graph-viewer-static";
const stage = join(outDir, NAME);

// [source, destination-within-the-zip]
const FILES = [
  ["src/web/static-viewer/viewer.html", "viewer.html"],
  ["src/web/static-viewer/wasm-app.js", "wasm-app.js"],
  ["src/web/static-viewer/vendor/sql-wasm.js", "vendor/sql-wasm.js"],
  ["src/web/static-viewer/vendor/sql-wasm.wasm", "vendor/sql-wasm.wasm"],
  ["src/web/public/style.css", "style.css"],
  ["src/web/public/app.js", "app.js"],
  ["src/web/public/vendor/cytoscape.min.js", "vendor/cytoscape.min.js"],
];

await rm(outDir, { recursive: true, force: true });
for (const [from, to] of FILES) {
  const dest = join(stage, to);
  await mkdir(dirname(dest), { recursive: true });
  await cp(join(repoRoot, from), dest);
}

// viewer.html is the entry point; a missing reference here ships a broken zip,
// so resolve every local src/href against what was actually staged.
const html = await readFile(join(stage, "viewer.html"), "utf8");
const refs = [...html.matchAll(/(?:src|href)="(?!https?:|\/\/|data:)([^"]+)"/g)].map((m) => m[1]);
const missing = [];
for (const ref of refs) {
  try {
    await access(join(stage, ref));
  } catch {
    missing.push(ref);
  }
}
if (missing.length > 0) {
  throw new Error(`static viewer would ship broken: viewer.html references ${missing.join(", ")}`);
}

const version = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8")).version;
const zipPath = join(outDir, `${NAME}-${version}.zip`);
try {
  execFileSync("zip", ["-qr", zipPath, NAME], { cwd: outDir });
} catch (err) {
  throw new Error(
    `packaging needs the \`zip\` command on PATH (present on GitHub runners and macOS): ${
      err instanceof Error ? err.message : String(err)
    }`,
  );
}
console.log(`static viewer -> ${zipPath}`);
console.log(`  ${refs.length} local references in viewer.html, all resolved`);
