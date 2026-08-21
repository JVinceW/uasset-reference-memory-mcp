// Isolates the SQLite write phase and compares candidate schema and pragma
// changes against the shipped configuration.
//
// Calibration, measured on a real 32,579-asset Unity project: the write phase
// is only about 5-7% of total indexing time (scan ~60%, extract ~33%). This
// corpus deliberately generates a far denser reference graph than that project
// has — ~139 edges per asset versus ~0.9 — so it resolves write-path
// differences that would otherwise sit inside run-to-run noise. Read results
// here as "percent of the write phase", and scale by the write phase's real
// share before predicting any end-to-end effect.
//
// Node and edge rows are produced once from a generated corpus and reused by
// every variant, so the only thing that differs between measurements is the
// write configuration. Variants run interleaved across rounds rather than
// grouped, so thermal drift and background load hit every variant equally
// instead of penalising whichever one ran last.
//
//   node scripts/benchmark-write-path.mjs [assets] [rounds]
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import Database from "better-sqlite3";
import { SCHEMA_SQL } from "../dist/store/schema.js";
import { extractReferences } from "../dist/indexer/ref-extractor.js";

const ASSETS = Number(process.argv[2] ?? 1500);
const ROUNDS = Number(process.argv[3] ?? 7);

// --- corpus ----------------------------------------------------------------
// Unity-shaped YAML: GameObject/MonoBehaviour pairs, a few large scene-sized
// assets, and many mid-sized prefabs. The 100-byte single-reference fixture in
// benchmark-indexer.mjs measures per-file overhead, not write throughput.
const guidOf = (i) => i.toString(16).padStart(32, "0");

function assetBody(index, nodeCount) {
  let body = "%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n";
  for (let n = 0; n < nodeCount; n += 1) {
    const go = 1_000_000 + n;
    body += `--- !u!1 &${go}\nGameObject:\n  m_ObjectHideFlags: 0\n`;
    body += `  m_CorrespondingSourceObject: {fileID: 0}\n  serializedVersion: 6\n  m_Component:\n`;
    for (let c = 0; c < 4; c += 1) body += `  - component: {fileID: ${2_000_000 + n * 4 + c}}\n`;
    body += `  m_Layer: 0\n  m_Name: Node${n}\n  m_IsActive: 1\n`;
    body += `--- !u!114 &${2_000_000 + n}\nMonoBehaviour:\n  m_GameObject: {fileID: ${go}}\n`;
    for (let r = 0; r < 3; r += 1) {
      const target = (index * 7 + n * 3 + r) % ASSETS;
      body += `  m_Ref${r}: {fileID: 11400000, guid: ${guidOf(target)}, type: 2}\n`;
    }
    body += `  m_Enabled: 1\n`;
  }
  return body;
}

const nodes = [];
const edges = [];
let corpusBytes = 0;
const resolve = () => "Prefab";
for (let i = 0; i < ASSETS; i += 1) {
  const nodeCount = i % 100 === 0 ? 900 : i % 10 === 0 ? 160 : 30;
  const body = assetBody(i, nodeCount);
  corpusBytes += Buffer.byteLength(body);
  nodes.push({
    guid: guidOf(i),
    path: `Assets/Asset${i}.prefab`,
    name: `Asset${i}`,
    assetType: "Prefab",
    origin: "project",
    packageId: null,
    fileSize: Buffer.byteLength(body),
    mtime: 0,
    isBinary: 0,
  });
  edges.push(...extractReferences(body, guidOf(i), resolve).edges);
}

// --- variants --------------------------------------------------------------
// Each variant is (pragmas applied at open, schema transform, post-load DDL).
const DROP_FROM_INDEX = (sql) =>
  sql.replace(/CREATE INDEX IF NOT EXISTS idx_edges_from ON edges\(from_guid\);\n?/, "");
const DEFER_TO_INDEX = (sql) =>
  sql.replace(/CREATE INDEX IF NOT EXISTS idx_edges_to\s+ON edges\(to_guid\);\n?/, "");
const WITHOUT_ROWID = (sql) =>
  sql.replace(
    /PRIMARY KEY \(from_guid, to_guid, ref_kind, context\)\n\);/,
    "PRIMARY KEY (from_guid, to_guid, ref_kind, context)\n) WITHOUT ROWID;",
  );

const VARIANTS = [
  { name: "baseline (shipped)", pragmas: [] },
  { name: "synchronous=NORMAL", pragmas: ["synchronous = NORMAL"] },
  { name: "foreign_keys=OFF", pragmas: ["foreign_keys = OFF"] },
  { name: "drop idx_edges_from", pragmas: [], schema: DROP_FROM_INDEX },
  { name: "defer idx_edges_to", pragmas: [], schema: DEFER_TO_INDEX, after: ["CREATE INDEX idx_edges_to ON edges(to_guid)"] },
  { name: "edges WITHOUT ROWID", pragmas: [], schema: WITHOUT_ROWID },
  {
    name: "drop + defer",
    pragmas: [],
    schema: (sql) => DEFER_TO_INDEX(DROP_FROM_INDEX(sql)),
    after: ["CREATE INDEX idx_edges_to ON edges(to_guid)"],
  },
  {
    name: "drop + defer + cache",
    pragmas: ["cache_size = -65536"],
    schema: (sql) => DEFER_TO_INDEX(DROP_FROM_INDEX(sql)),
    after: ["CREATE INDEX idx_edges_to ON edges(to_guid)"],
  },
  {
    name: "drop + defer + norowid",
    pragmas: [],
    schema: (sql) => WITHOUT_ROWID(DEFER_TO_INDEX(DROP_FROM_INDEX(sql))),
    after: ["CREATE INDEX idx_edges_to ON edges(to_guid)"],
  },
];

// Mirrors GraphStore.UPSERT_NODE / INSERT_EDGE so the benchmark exercises the
// same statements the indexer runs.
const UPSERT_NODE = `
  INSERT OR REPLACE INTO assets
    (guid, path, name, asset_type, origin, package_id, file_size, mtime, is_binary)
  VALUES (@guid, @path, @name, @assetType, @origin, @packageId, @fileSize, @mtime, @isBinary)`;
const INSERT_EDGE = `
  INSERT INTO edges (from_guid, to_guid, ref_kind, file_id, context, count)
  VALUES (@fromGuid, @toGuid, @refKind, @fileId, @context, @count)
  ON CONFLICT(from_guid, to_guid, ref_kind, context)
    DO UPDATE SET count = count + excluded.count`;

const workDir = mkdtempSync(join(tmpdir(), "uasset-write-bench-"));

function runVariant(variant, round) {
  const dbPath = join(workDir, `${variant.name.replace(/\W+/g, "-")}-${round}.db`);
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  for (const p of variant.pragmas) db.pragma(p);
  db.exec(variant.schema ? variant.schema(SCHEMA_SQL) : SCHEMA_SQL);

  const nodeStmt = db.prepare(UPSERT_NODE);
  const edgeStmt = db.prepare(INSERT_EDGE);
  const writeNodes = db.transaction((items) => { for (const n of items) nodeStmt.run(n); });
  const writeEdges = db.transaction((items) => { for (const e of items) edgeStmt.run(e); });

  const started = performance.now();
  writeNodes(nodes);
  writeEdges(edges);
  for (const ddl of variant.after ?? []) db.exec(ddl);
  const elapsed = performance.now() - started;

  const counts = {
    assets: db.prepare("SELECT COUNT(*) AS n FROM assets").get().n,
    edges: db.prepare("SELECT COUNT(*) AS n FROM edges").get().n,
  };
  db.close();
  rmSync(dbPath, { force: true });
  rmSync(`${dbPath}-wal`, { force: true });
  rmSync(`${dbPath}-shm`, { force: true });
  return { elapsed, counts };
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const samples = new Map(VARIANTS.map((v) => [v.name, []]));
const parity = new Map();
// Round 0 is a discarded warm-up: it pays first-touch page cache and JIT costs.
for (let round = 0; round <= ROUNDS; round += 1) {
  for (const variant of VARIANTS) {
    const { elapsed, counts } = runVariant(variant, round);
    if (round > 0) samples.get(variant.name).push(elapsed);
    parity.set(variant.name, counts);
  }
}
rmSync(workDir, { recursive: true, force: true });

const expected = parity.get(VARIANTS[0].name);
const mismatched = [...parity].filter(
  ([, c]) => c.assets !== expected.assets || c.edges !== expected.edges,
);

const base = median(samples.get(VARIANTS[0].name));
console.log(
  `corpus: ${ASSETS} assets, ${(corpusBytes / 1048576).toFixed(1)} MB, ` +
    `${nodes.length} nodes, ${edges.length} edges | ${ROUNDS} rounds, interleaved\n`,
);
console.log("variant                | median |    min |    max |   CV | vs baseline");
console.log("-".repeat(76));
for (const v of VARIANTS) {
  const xs = samples.get(v.name);
  const med = median(xs);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  console.log(
    v.name.padEnd(22) + " | " +
      `${med.toFixed(0)} ms`.padStart(6) + " | " +
      `${Math.min(...xs).toFixed(0)}`.padStart(6) + " | " +
      `${Math.max(...xs).toFixed(0)}`.padStart(6) + " | " +
      `${((sd / mean) * 100).toFixed(1)}%`.padStart(5) + " | " +
      (v === VARIANTS[0] ? "—" : `${(base / med).toFixed(2)}x  (${(((base - med) / base) * 100).toFixed(1)}% faster)`),
  );
}
console.log(
  `\nrow-count parity: ${
    mismatched.length === 0
      ? `all variants ${expected.assets} assets / ${expected.edges} edges`
      : `MISMATCH -> ${JSON.stringify(mismatched)}`
  }`,
);
if (mismatched.length > 0) process.exitCode = 1;
