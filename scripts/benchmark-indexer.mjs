import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { indexProject } from "../dist/indexer/index-project.js";

const assetCount = Number(process.argv[2] ?? 2000);
const benchmarkRoot = join(tmpdir(), `uasset-reference-mcp-indexer-bench-${assetCount}`);
const fixtureRoot = join(benchmarkRoot, "fixture");
const assetsRoot = join(fixtureRoot, "Assets");

await mkdir(assetsRoot, { recursive: true });
for (let i = 0; i < assetCount; i += 1) {
  const guid = i.toString(16).padStart(32, "0");
  const target = i === 0 ? "0".repeat(32) : (i - 1).toString(16).padStart(32, "0");
  const assetPath = join(assetsRoot, `Asset${i}.prefab`);
  await writeFile(
    assetPath,
    `%YAML 1.1\nPrefab:\n  m_Target: {fileID: 100100000, guid: ${target}, type: 3}\n`,
  );
  await writeFile(
    `${assetPath}.meta`,
    `fileFormatVersion: 2\nguid: ${guid}\nPrefabImporter:\n  externalObjects: {}\n`,
  );
}

const runs = [];
for (const concurrency of [1, 4, 8]) {
  const dbPath = join(benchmarkRoot, `index-${concurrency}.db`);
  const summary = await indexProject(fixtureRoot, {
    dbPath,
    force: true,
    concurrency,
  });
  runs.push({
    concurrency,
    assetCount: summary.assetCount,
    edgeCount: summary.edgeCount,
    unresolvedCount: summary.unresolvedCount,
    timings: summary.timings,
  });
}

console.log(JSON.stringify({ assetCount, fixtureRoot, runs }, null, 2));
