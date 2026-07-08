import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { brotliCompressSync, brotliDecompressSync } from "node:zlib";
import { dirname, join } from "node:path";
import { GraphStore } from "../store/graph-store.js";

const SNAPSHOT_FILE = "index.db.br";
const ARTIFACT_FILE = "artifact.json";
const GITATTRIBUTES = ".gitattributes";
// Treat the compressed blob as binary and never merge it (last-write-wins).
const GITATTRIBUTES_LINE = `${SNAPSHOT_FILE} merge=ours binary`;

export interface SnapshotArtifact {
  schema_version: number;
  indexed_at: string | null;
  asset_count: number;
  edge_count: number;
  original_size: number;
  compressed_size: number;
  tool_version: string | null;
  git_commit: string | null;
}

const snapshotPath = (dbPath: string) => join(dirname(dbPath), SNAPSHOT_FILE);

/** True when a committed snapshot sits next to the (possibly absent) live index. */
export function snapshotExists(dbPath: string): boolean {
  return existsSync(snapshotPath(dbPath));
}

/**
 * Compress the live index into a committable snapshot next to it, with an
 * `artifact.json` (schema, counts, sizes, provenance) and a `.gitattributes`
 * that keeps the binary blob merge-free. Teammates commit these; `importSnapshot`
 * restores the live index from them without re-indexing.
 */
export async function exportSnapshot(
  dbPath: string,
  opts: { toolVersion?: string; gitCommit?: string } = {},
): Promise<SnapshotArtifact> {
  const store = GraphStore.open(dbPath);
  const schema_version = Number(store.getMeta("schema_version") ?? 0);
  const indexed_at = store.getMeta("indexed_at");
  const asset_count = store.assetCount();
  const edge_count = store.edgeCount();
  store.db.pragma("wal_checkpoint(TRUNCATE)");
  store.close();

  const raw = await readFile(dbPath);
  const compressed = brotliCompressSync(raw);
  const dir = dirname(dbPath);
  await writeFile(snapshotPath(dbPath), compressed);

  const artifact: SnapshotArtifact = {
    schema_version,
    indexed_at,
    asset_count,
    edge_count,
    original_size: raw.length,
    compressed_size: compressed.length,
    tool_version: opts.toolVersion ?? null,
    git_commit: opts.gitCommit ?? null,
  };
  await writeFile(join(dir, ARTIFACT_FILE), JSON.stringify(artifact, null, 2) + "\n");
  await writeFile(join(dir, GITATTRIBUTES), GITATTRIBUTES_LINE + "\n");
  return artifact;
}

/** Decompress the committed snapshot into the live index at `dbPath`. */
export async function importSnapshot(dbPath: string): Promise<void> {
  const compressed = await readFile(snapshotPath(dbPath));
  await writeFile(dbPath, brotliDecompressSync(compressed));
}

/**
 * If the live index is missing but a snapshot exists, restore it (so a fresh
 * clone works without re-indexing). Returns whether an import happened.
 */
export async function ensureLiveIndex(dbPath: string): Promise<boolean> {
  if (existsSync(dbPath)) return false;
  if (!snapshotExists(dbPath)) return false;
  await importSnapshot(dbPath);
  return true;
}
