import { copyFile, readFile, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { GraphStore } from "../store/graph-store.js";
import { scanProject, buildIgnore } from "./meta-scanner.js";
import { loadConfig, configPathFor } from "../config/project-config.js";
import { BUILTIN_NODES } from "./builtins.js";
import { assertUniqueAssetGuids } from "./guid-validation.js";
import { readSerializationMode } from "./project-settings.js";
import { extractReferences, type Resolver } from "./ref-extractor.js";
import {
  AddressableParseError,
  extractAddressableGroup,
  type AddressableGroup,
} from "./addressables.js";
import { SCHEMA_VERSION } from "../store/schema.js";
import type { AssetNode, AssetType, Edge, ScanResult, ScanWarning, UnresolvedRef } from "./types.js";
import { normalizeConcurrency, mapWithConcurrency } from "../util/async.js";

export interface IndexOptions {
  dbPath: string;
  force?: boolean;
  unityVersion?: string;
  concurrency?: number;
  scan?: (projectRoot: string, ignore?: (name: string, relPath: string) => boolean) => Promise<ScanResult>;
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
  timings: IndexTimings;
}

export interface IndexTimings {
  scanMs: number;
  applyMs: number;
  extractionMs: number;
  writeMs: number;
  totalMs: number;
}

/** Thrown when the whole project is set to ForceBinary asset serialization. */
export class BinarySerializationError extends Error {
  constructor() {
    super(
      `binary serialization detected: this project's EditorSettings uses ` +
        `ForceBinary asset serialization, so references cannot be parsed from ` +
        `text. Set Edit > Project Settings > Editor > Asset Serialization to ` +
        `"Force Text" and re-import.`,
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
  const startedAt = performance.now();
  const concurrency = normalizeConcurrency(opts.concurrency);
  const scan = opts.scan ?? ((root, ignore) => scanProject(root, ignore, concurrency));
  const { dbPath } = opts;
  const tempPath = `${dbPath}.building-${process.pid}`;

  await cleanupDbFiles(tempPath);
  const hasCurrentIndex = !opts.force && (await fileExists(dbPath));
  let incremental =
    hasCurrentIndex &&
    GraphStore.readSchemaVersion(dbPath) === SCHEMA_VERSION &&
    !GraphStore.requiresLegacyRebuild(dbPath);
  if (incremental) await copyFile(dbPath, tempPath);

  let store = GraphStore.open(tempPath);
  try {
    // Fail loudly only when the whole project is ForceBinary. Incidental
    // always-binary assets (LightingData, NavMesh, ...) are skipped per-file.
    if ((await readSerializationMode(projectRoot)) === "binary") {
      throw new BinarySerializationError();
    }
    const config = loadConfig(configPathFor(dbPath));
    const scanStartedAt = performance.now();
    const result = await scan(projectRoot, buildIgnore(config.scan));
    const scanMs = performance.now() - scanStartedAt;
    assertUniqueAssetGuids(result.nodes, BUILTIN_NODES);
    if (
      incremental &&
      result.packageFingerprint &&
      store.getMeta("package_discovery_fingerprint") !== result.packageFingerprint
    ) {
      store.close();
      await cleanupDbFiles(tempPath);
      store = GraphStore.open(tempPath);
      incremental = false;
    }
    // Built-in sentinel guids resolve against synthetic nodes so references to
    // them are edges, not broken refs (US-004). They are stored as infrastructure
    // but excluded from the user-facing change counts.
    const resolve = buildResolver([...BUILTIN_NODES, ...result.nodes]);
    const warnings = [...result.warnings];
    const timings = { extractionMs: 0, writeMs: 0 };
    const builtinWriteStartedAt = performance.now();
    store.upsertNodes([...BUILTIN_NODES]);
    timings.writeMs += performance.now() - builtinWriteStartedAt;

    const applyStartedAt = performance.now();
    const counts = incremental
      ? await applyIncremental(store, projectRoot, result.nodes, resolve, warnings, timings, concurrency)
      : await applyFresh(store, projectRoot, result.nodes, resolve, warnings, timings, concurrency);
    const applyMs = performance.now() - applyStartedAt;

    store.setMeta("schema_version", String(SCHEMA_VERSION));
    store.setMeta("project_root", projectRoot);
    store.setMeta("indexed_at", new Date().toISOString());
    store.setMeta("asset_count", String(store.assetCount()));
    if (result.packageFingerprint) {
      store.setMeta("package_discovery_fingerprint", result.packageFingerprint);
    }
    if (opts.unityVersion) store.setMeta("unity_version", opts.unityVersion);
    const lockMtime = await lockfileMtime(projectRoot);
    if (lockMtime !== null) store.setMeta("packages_lock_mtime", String(lockMtime));

    const summary: IndexSummary = {
      assetCount: store.assetCount(),
      edgeCount: store.edgeCount(),
      unresolvedCount: store.unresolvedCount(),
      warnings,
      ...counts,
      timings: {
        scanMs,
        applyMs,
        extractionMs: timings.extractionMs,
        writeMs: timings.writeMs,
        totalMs: performance.now() - startedAt,
      },
    };

    store.db.pragma("wal_checkpoint(TRUNCATE)");
    store.close();
    await swapIntoPlace(tempPath, dbPath);
    return summary;
  } catch (err) {
    if (store.db.open) store.close();
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
  timings: Pick<IndexTimings, "extractionMs" | "writeMs">,
  concurrency: number,
): Promise<ChangeCounts> {
  const nodeWriteStartedAt = performance.now();
  store.upsertNodes(nodes);
  timings.writeMs += performance.now() - nodeWriteStartedAt;
  const extractionStartedAt = performance.now();
  const { edges, unresolved, addressableGroups } = await extractAll(
    projectRoot,
    nodes,
    resolve,
    warnings,
    concurrency,
  );
  timings.extractionMs += performance.now() - extractionStartedAt;
  const edgeWriteStartedAt = performance.now();
  store.insertEdges(edges);
  store.insertUnresolved(unresolved);
  store.replaceAddressableGroups(addressableGroups);
  timings.writeMs += performance.now() - edgeWriteStartedAt;
  return { added: nodes.length, updated: 0, removed: 0, unchanged: 0 };
}

async function applyIncremental(
  store: GraphStore,
  projectRoot: string,
  nodes: AssetNode[],
  resolve: Resolver,
  warnings: ScanWarning[],
  timings: Pick<IndexTimings, "extractionMs" | "writeMs">,
  concurrency: number,
): Promise<ChangeCounts> {
  const priorByPath = store.getNodeMtimes();
  const priorByGuid = new Map<string, { path: string; mtime: number }>();
  for (const [path, info] of priorByPath) {
    priorByGuid.set(info.guid, { path, mtime: info.mtime });
  }
  const currentByGuid = new Map(nodes.map((node) => [node.guid, node]));
  const addedNodes: AssetNode[] = [];
  const updatedNodes: AssetNode[] = [];
  let unchanged = 0;

  for (const n of nodes) {
    const p = priorByGuid.get(n.guid);
    if (!p) addedNodes.push(n);
    else if (p.path !== n.path || p.mtime !== n.mtime) updatedNodes.push(n);
    else unchanged++;
  }

  const builtinGuids = new Set(BUILTIN_NODES.map((n) => n.guid));
  const removedGuids: string[] = [];
  for (const guid of priorByGuid.keys()) {
    if (!currentByGuid.has(guid) && !builtinGuids.has(guid)) removedGuids.push(guid);
  }

  const addedByPath = new Map(addedNodes.map((node) => [node.path, node]));
  for (const oldGuid of removedGuids) {
    const path = priorByGuid.get(oldGuid)!.path;
    const replacement = addedByPath.get(path);
    if (replacement) {
      warnings.push({
        kind: "guid-replaced",
        path,
        message: `asset guid replaced at ${path}: ${oldGuid} -> ${replacement.guid}`,
      });
    }
  }

  const typeChangedTargetGuids = updatedNodes
    .filter((node) => store.getNode(node.guid)?.assetType !== node.assetType)
    .map((node) => node.guid);
  const affectedSourceGuids = new Set([
    ...store.incomingSourceGuids(typeChangedTargetGuids),
    ...store.unresolvedSourceGuids(addedNodes.map((node) => node.guid)),
  ]);
  const currentNodesByGuid = new Map(nodes.map((node) => [node.guid, node]));
  const affectedSourceNodes = [...affectedSourceGuids]
    .map((guid) => currentNodesByGuid.get(guid))
    .filter((node): node is AssetNode => node !== undefined);

  // Nodes: upsert changed, then handle removals (demote inbound, drop node).
  const nodeWriteStartedAt = performance.now();
  store.upsertNodes([...addedNodes, ...updatedNodes]);
  for (const guid of removedGuids) store.demoteIncomingToUnresolved(guid);
  store.deleteOutgoing(removedGuids);
  store.deleteNodesByGuid(removedGuids);
  timings.writeMs += performance.now() - nodeWriteStartedAt;

  // Edges: re-extract changed files and unchanged sources whose target type or
  // resolution changed. Re-reading the source preserves full edge fidelity.
  const changedByGuid = new Map(
    [...addedNodes, ...updatedNodes, ...affectedSourceNodes].map((node) => [node.guid, node]),
  );
  const changed = [...changedByGuid.values()];
  const changedEdgeCleanupStartedAt = performance.now();
  store.deleteOutgoing(changed.map((node) => node.guid));
  timings.writeMs += performance.now() - changedEdgeCleanupStartedAt;
  const extractionStartedAt = performance.now();
  const { edges, unresolved, addressableGroups } = await extractAll(
    projectRoot,
    changed,
    resolve,
    warnings,
    concurrency,
  );
  timings.extractionMs += performance.now() - extractionStartedAt;
  const edgeWriteStartedAt = performance.now();
  store.insertEdges(edges);
  store.insertUnresolved(unresolved);
  store.replaceAddressableGroupsForAssets(
    [...changed.map((node) => node.guid), ...removedGuids],
    addressableGroups,
  );
  timings.writeMs += performance.now() - edgeWriteStartedAt;

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
  concurrency: number,
): Promise<{
  edges: Edge[];
  unresolved: UnresolvedRef[];
  addressableGroups: AddressableGroup[];
}> {
  const results = await mapWithConcurrency(nodes, concurrency, async (node) => {
    const result: {
      edges: Edge[];
      unresolved: UnresolvedRef[];
      addressableGroups: AddressableGroup[];
      warnings: ScanWarning[];
    } = { edges: [], unresolved: [], addressableGroups: [], warnings: [] };
    if (node.isBinary) return result; // folders and non-YAML assets

    let content: string;
    const sourcePath = node.sourcePath ?? join(projectRoot, node.path);
    try {
      content = await readFile(sourcePath, "utf8");
    } catch {
      result.warnings.push({
        kind: "unreadable-asset",
        path: node.path,
        message: `could not read asset for reference extraction: ${node.path}`,
      });
      return result;
    }

    const res = extractReferences(content, node.guid, resolve);
    if (res.binarySerialized) {
      // Incidental always-binary asset (e.g. LightingData.asset) in a text
      // project — skip its edges rather than aborting the whole index.
      result.warnings.push({
        kind: "binary-serialized",
        path: node.path,
        message: `asset is binary-serialized; skipped reference extraction: ${node.path}`,
      });
      return result;
    }
    result.edges.push(...res.edges);
    result.unresolved.push(...res.unresolved);
    try {
      const group = extractAddressableGroup(content, { assetGuid: node.guid, path: node.path });
      if (group) result.addressableGroups.push(group);
    } catch (error) {
      if (error instanceof AddressableParseError) {
        result.warnings.push({ kind: "unreadable-asset", path: node.path, message: error.message });
      } else {
        throw error;
      }
    }
    return result;
  });

  const edges: Edge[] = [];
  const unresolved: UnresolvedRef[] = [];
  const addressableGroups: AddressableGroup[] = [];
  for (const result of results) {
    edges.push(...result.edges);
    unresolved.push(...result.unresolved);
    addressableGroups.push(...result.addressableGroups);
    warnings.push(...result.warnings);
  }
  return { edges, unresolved, addressableGroups };
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
