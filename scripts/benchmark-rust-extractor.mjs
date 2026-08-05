import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { extractReferences } from "../dist/indexer/ref-extractor.js";
import { mapWithConcurrency } from "../dist/util/async.js";

const assetCount = Number(process.argv[2] ?? 2000);
const fixtureRoot = join(tmpdir(), `uasset-reference-mcp-indexer-bench-${assetCount}`, "fixture");
const benchmarkRoot = join(tmpdir(), `uasset-reference-mcp-rust-extractor-${assetCount}`);
const assetsRoot = join(fixtureRoot, "Assets");
const targetsPath = join(benchmarkRoot, "targets.json");
const inputPath = join(benchmarkRoot, "inputs.ndjson");
const rustBinary = join(
  process.cwd(),
  "rust",
  "uasset-ref-extractor",
  "target",
  "release",
  process.platform === "win32" ? "uasset-ref-extractor.exe" : "uasset-ref-extractor",
);

await mkdir(benchmarkRoot, { recursive: true });
const names = (await readdir(assetsRoot))
  .filter((name) => name.endsWith(".prefab"))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const records = await Promise.all(
  names.map(async (name) => {
    const index = Number(name.match(/Asset(\d+)\.prefab/)?.[1]);
    return {
      fromGuid: index.toString(16).padStart(32, "0"),
      content: await readFile(join(assetsRoot, name), "utf8"),
    };
  }),
);
const targets = Object.fromEntries(
  records.map((record) => [record.fromGuid, "Prefab"]),
);
await writeFile(targetsPath, JSON.stringify(targets));
const input = records.map((record) => JSON.stringify(record)).join("\n") + "\n";
await writeFile(inputPath, input);

const runNode = async (concurrency) => {
  const started = performance.now();
  const outputs = await mapWithConcurrency(records, concurrency, async (record) =>
    extractReferences(record.content, record.fromGuid, (guid) => targets[guid] ?? null),
  );
  const elapsedMs = performance.now() - started;
  return { elapsedMs, innerMs: elapsedMs, outputs };
};

const runRust = (threads) => new Promise((resolve, reject) => {
  const started = performance.now();
  const child = spawn(rustBinary, ["--targets", targetsPath, "--threads", String(threads)], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  child.on("error", reject);
  child.on("close", (code) => {
    const errorOutput = Buffer.concat(stderr).toString("utf8");
    if (code !== 0) {
      reject(new Error(errorOutput || `Rust extractor exited with ${code}`));
      return;
    }
    const innerMs = Number(errorOutput.match(/extract_ms=([0-9.]+)/)?.[1] ?? NaN);
    resolve({
      elapsedMs: performance.now() - started,
      innerMs,
      outputs: Buffer.concat(stdout)
        .toString("utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
    });
  });
  child.stdin.end(input);
});

const modes = [
  ["node-1", () => runNode(1)],
  ["node-8", () => runNode(8)],
  ["rust-1", () => runRust(1)],
  ["rust-8", () => runRust(8)],
];
const results = [];
for (const [name, run] of modes) {
  const warmup = await run();
  const measured = [];
  const measuredInner = [];
  let parity = true;
  for (let i = 0; i < 3; i += 1) {
    const result = await run();
    measured.push(result.elapsedMs);
    measuredInner.push(result.innerMs);
    parity = parity && JSON.stringify(result.outputs) === JSON.stringify(warmup.outputs);
  }
  results.push({
    name,
    medianMs: [...measured].sort((a, b) => a - b)[1],
    minMs: Math.min(...measured),
    maxMs: Math.max(...measured),
    medianInnerMs: [...measuredInner].sort((a, b) => a - b)[1],
    minInnerMs: Math.min(...measuredInner),
    maxInnerMs: Math.max(...measuredInner),
    outputCount: warmup.outputs.length,
    edgeCount: warmup.outputs.reduce((sum, output) => sum + output.edges.length, 0),
    unresolvedCount: warmup.outputs.reduce((sum, output) => sum + output.unresolved.length, 0),
    parity,
  });
}

console.log(JSON.stringify({ fixtureRoot, rustBinary, records: records.length, results }, null, 2));
