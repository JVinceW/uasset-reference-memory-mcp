import { copyFile, rename, rm, stat } from "node:fs/promises";
import { GraphStore } from "../store/graph-store.js";
import { scanProject } from "./meta-scanner.js";
import { SCHEMA_VERSION } from "../store/schema.js";
import type { AssetNode, ScanResult, ScanWarning } from "./types.js";

export interface IndexOptions {
  /** Destination SQLite file. */
  dbPath: string;
  /** Rebuild from scratch instead of incremental. */
  force?: boolean;
  /** Optional Unity version to stamp in index_meta. */
  unityVersion?: string;
  /** Injectable scanner (defaults to scanProject); used for testing. */
  scan?: (projectRoot: string) => Promise<ScanResult>;
}

export interface IndexSummary {
  assetCount: number;
  edgeCount: number;
  unresolvedCount: number;
  warnings: ScanWarning[];
  added: number;
  updated: number;
  removed: number;
  unchanged: number;
}

/**
 * Index a Unity project into the SQLite store. Builds into a temp file and
 * atomically swaps it into place, so an interrupted or failing run leaves any
 * prior index untouched (US-003). Default mode is incremental by mtime; `force`
 * rebuilds from scratch.
 */
export async function indexProject(
  projectRoot: string,
  opts: IndexOptions,
): Promise<IndexSummary> {
  const scan = opts.scan ?? scanProject;
  const { dbPath } = opts;
  const tempPath = `${dbPath}.building-${process.pid}`;

  await cleanupDbFiles(tempPath);

  const incremental = !opts.force && (await fileExists(dbPath));
  if (incremental) await copyFile(dbPath, tempPath);

  const store = GraphStore.open(tempPath);
  let counts: Pick<IndexSummary, "added" | "updated" | "removed" | "unchanged">;
  let result: ScanResult;
  try {
    result = await scan(projectRoot);
    counts = incremental
      ? applyIncremental(store, result.nodes)
      : applyFresh(store, result.nodes);

    store.setMeta("schema_version", String(SCHEMA_VERSION));
    store.setMeta("project_root", projectRoot);
    store.setMeta("indexed_at", new Date().toISOString());
    store.setMeta("asset_count", String(store.assetCount()));
    if (opts.unityVersion) store.setMeta("unity_version", opts.unityVersion);

    const summary: IndexSummary = {
      assetCount: store.assetCount(),
      edgeCount: store.edgeCount(),
      unresolvedCount: store.unresolvedCount(),
      warnings: result.warnings,
      ...counts,
    };

    store.db.pragma("wal_checkpoint(TRUNCATE)");
    store.close();
    await swapIntoPlace(tempPath, dbPath);
    return summary;
  } catch (err) {
    store.close();
    await cleanupDbFiles(tempPath);
    throw err;
  }
}

function applyFresh(
  store: GraphStore,
  nodes: AssetNode[],
): Pick<IndexSummary, "added" | "updated" | "removed" | "unchanged"> {
  store.upsertNodes(nodes);
  return { added: nodes.length, updated: 0, removed: 0, unchanged: 0 };
}

function applyIncremental(
  store: GraphStore,
  nodes: AssetNode[],
): Pick<IndexSummary, "added" | "updated" | "removed" | "unchanged"> {
  const prior = store.getNodeMtimes();
  const currentPaths = new Set<string>();
  const toUpsert: AssetNode[] = [];
  let added = 0;
  let updated = 0;
  let unchanged = 0;

  for (const n of nodes) {
    currentPaths.add(n.path);
    const p = prior.get(n.path);
    if (!p) {
      added++;
      toUpsert.push(n);
    } else if (p.mtime !== n.mtime) {
      updated++;
      toUpsert.push(n);
    } else {
      unchanged++;
    }
  }

  const removedGuids: string[] = [];
  for (const [path, info] of prior) {
    if (!currentPaths.has(path)) removedGuids.push(info.guid);
  }

  store.upsertNodes(toUpsert);
  store.deleteNodesByGuid(removedGuids);
  return { added, updated, removed: removedGuids.length, unchanged };
}

async function swapIntoPlace(tempPath: string, dbPath: string): Promise<void> {
  await rename(tempPath, dbPath);
  // The renamed file is a fully checkpointed single db; drop any stale sidecars
  // of the destination so a subsequent open never replays an old WAL.
  await rm(`${dbPath}-wal`, { force: true });
  await rm(`${dbPath}-shm`, { force: true });
}

async function cleanupDbFiles(path: string): Promise<void> {
  await rm(path, { force: true });
  await rm(`${path}-wal`, { force: true });
  await rm(`${path}-shm`, { force: true });
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
