import { copyFile, readFile, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { GraphStore } from "../store/graph-store.js";
import { scanProject } from "./meta-scanner.js";
import { BUILTIN_NODES } from "./builtins.js";
import { extractReferences, kindFor, type Resolver } from "./ref-extractor.js";
import { SCHEMA_VERSION } from "../store/schema.js";
import type { AssetNode, AssetType, Edge, ScanResult, ScanWarning, UnresolvedRef } from "./types.js";

export interface IndexOptions {
  dbPath: string;
  force?: boolean;
  unityVersion?: string;
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

/** Thrown when an expected-text asset is binary-serialized (Force Text is off). */
export class BinarySerializationError extends Error {
  constructor(public readonly path: string) {
    super(
      `binary serialization detected at ${path}: this project uses binary asset ` +
        `serialization. Set Edit > Project Settings > Editor > Asset Serialization ` +
        `to "Force Text" and re-import.`,
    );
    this.name = "BinarySerializationError";
  }
}

/**
 * Index a Unity project into the SQLite store (US-001..US-003 nodes + US-002
 * edges). Builds into a temp file and atomically swaps, so a failing run leaves
 * any prior index intact. Incremental by mtime; `force` rebuilds from scratch.
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
  try {
    const result = await scan(projectRoot);
    // Built-in sentinel guids resolve against synthetic nodes so references to
    // them are edges, not broken refs (US-004). They are stored as infrastructure
    // but excluded from the user-facing change counts.
    const resolve = buildResolver([...BUILTIN_NODES, ...result.nodes]);
    const warnings = [...result.warnings];
    store.upsertNodes([...BUILTIN_NODES]);

    const counts = incremental
      ? await applyIncremental(store, projectRoot, result.nodes, resolve, warnings)
      : await applyFresh(store, projectRoot, result.nodes, resolve, warnings);

    store.setMeta("schema_version", String(SCHEMA_VERSION));
    store.setMeta("project_root", projectRoot);
    store.setMeta("indexed_at", new Date().toISOString());
    store.setMeta("asset_count", String(store.assetCount()));
    if (opts.unityVersion) store.setMeta("unity_version", opts.unityVersion);
    const lockMtime = await lockfileMtime(projectRoot);
    if (lockMtime !== null) store.setMeta("packages_lock_mtime", String(lockMtime));

    const summary: IndexSummary = {
      assetCount: store.assetCount(),
      edgeCount: store.edgeCount(),
      unresolvedCount: store.unresolvedCount(),
      warnings,
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

type ChangeCounts = Pick<IndexSummary, "added" | "updated" | "removed" | "unchanged">;

async function applyFresh(
  store: GraphStore,
  projectRoot: string,
  nodes: AssetNode[],
  resolve: Resolver,
  warnings: ScanWarning[],
): Promise<ChangeCounts> {
  store.upsertNodes(nodes);
  const { edges, unresolved } = await extractAll(projectRoot, nodes, resolve, warnings);
  store.insertEdges(edges);
  store.insertUnresolved(unresolved);
  return { added: nodes.length, updated: 0, removed: 0, unchanged: 0 };
}

async function applyIncremental(
  store: GraphStore,
  projectRoot: string,
  nodes: AssetNode[],
  resolve: Resolver,
  warnings: ScanWarning[],
): Promise<ChangeCounts> {
  const prior = store.getNodeMtimes();
  const currentPaths = new Set<string>();
  const addedNodes: AssetNode[] = [];
  const updatedNodes: AssetNode[] = [];
  let unchanged = 0;

  for (const n of nodes) {
    currentPaths.add(n.path);
    const p = prior.get(n.path);
    if (!p) addedNodes.push(n);
    else if (p.mtime !== n.mtime) updatedNodes.push(n);
    else unchanged++;
  }

  const builtinGuids = new Set(BUILTIN_NODES.map((n) => n.guid));
  const removedGuids: string[] = [];
  for (const [path, info] of prior) {
    if (!currentPaths.has(path) && !builtinGuids.has(info.guid)) removedGuids.push(info.guid);
  }

  // Nodes: upsert changed, then handle removals (demote inbound, drop node).
  store.upsertNodes([...addedNodes, ...updatedNodes]);
  for (const guid of removedGuids) store.demoteIncomingToUnresolved(guid);
  store.deleteOutgoing(removedGuids);
  store.deleteNodesByGuid(removedGuids);

  // Edges: promote inbound for new targets, re-extract outbound for changed files.
  for (const n of addedNodes) store.promoteUnresolved(n.guid, kindFor(n.assetType));
  store.deleteOutgoing(updatedNodes.map((n) => n.guid));
  const changed = [...addedNodes, ...updatedNodes];
  const { edges, unresolved } = await extractAll(projectRoot, changed, resolve, warnings);
  store.insertEdges(edges);
  store.insertUnresolved(unresolved);

  return {
    added: addedNodes.length,
    updated: updatedNodes.length,
    removed: removedGuids.length,
    unchanged,
  };
}

async function extractAll(
  projectRoot: string,
  nodes: AssetNode[],
  resolve: Resolver,
  warnings: ScanWarning[],
): Promise<{ edges: Edge[]; unresolved: UnresolvedRef[] }> {
  const edges: Edge[] = [];
  const unresolved: UnresolvedRef[] = [];

  for (const node of nodes) {
    if (node.isBinary) continue; // folders and non-YAML assets
    let content: string;
    try {
      content = await readFile(join(projectRoot, node.path), "utf8");
    } catch {
      warnings.push({
        kind: "unreadable-asset",
        path: node.path,
        message: `could not read asset for reference extraction: ${node.path}`,
      });
      continue;
    }

    const res = extractReferences(content, node.guid, resolve);
    if (res.binarySerialized) throw new BinarySerializationError(node.path);
    edges.push(...res.edges);
    unresolved.push(...res.unresolved);
  }

  return { edges, unresolved };
}

function buildResolver(nodes: AssetNode[]): Resolver {
  const typeByGuid = new Map<string, AssetType>();
  for (const n of nodes) typeByGuid.set(n.guid, n.assetType);
  return (guid: string) => typeByGuid.get(guid) ?? null;
}

async function swapIntoPlace(tempPath: string, dbPath: string): Promise<void> {
  await rename(tempPath, dbPath);
  await rm(`${dbPath}-wal`, { force: true });
  await rm(`${dbPath}-shm`, { force: true });
}

async function cleanupDbFiles(path: string): Promise<void> {
  await rm(path, { force: true });
  await rm(`${path}-wal`, { force: true });
  await rm(`${path}-shm`, { force: true });
}

/** mtime (epoch ms, floored) of Packages/packages-lock.json, or null if absent. */
async function lockfileMtime(projectRoot: string): Promise<number | null> {
  try {
    const info = await stat(join(projectRoot, "Packages", "packages-lock.json"));
    return Math.floor(info.mtimeMs);
  } catch {
    return null;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
