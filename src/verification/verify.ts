import type { AssetNode, Origin, RefKind } from "../indexer/types.js";
import { kindFor } from "../indexer/ref-extractor.js";
import { GraphStore } from "../store/graph-store.js";

export interface UnityVerificationDependency {
  path: string;
  guid: string;
}

export interface UnityVerificationAsset {
  path: string;
  guid: string;
  dependencies: UnityVerificationDependency[];
}

export interface UnityVerificationExport {
  schemaVersion: 1;
  unityVersion: string;
  exportedAt: string;
  assets: UnityVerificationAsset[];
}

export interface VerificationEdge {
  fromGuid: string;
  toGuid: string;
  fromPath: string;
  toPath: string;
  refKind: RefKind;
  sourceAssetType: AssetNode["assetType"];
  sourceOrigin: Origin;
  unityFromPath?: string;
  unityToPath?: string;
}

export interface VerificationGroup {
  sourceAssetType: AssetNode["assetType"];
  sourceOrigin: Origin;
  refKind: RefKind;
  matchedCount: number;
  missedEdgeCount: number;
  extraEdgeCount: number;
}

export interface VerificationReport {
  unityVersion: string;
  exportedAt: string;
  verifiedAt: string;
  unityDependencyCount: number;
  indexedDependencyCount: number;
  matchedCount: number;
  coveragePercent: number | null;
  missedEdges: VerificationEdge[];
  extraEdges: VerificationEdge[];
  groups: VerificationGroup[];
  unresolvedAssets: { path: string; guid: string }[];
  unresolvedDependencies: { fromPath: string; fromGuid: string; path: string; guid: string }[];
  guidMismatches: { path: string; guid: string; indexedPath: string }[];
}

export function verifyIndex(
  store: GraphStore,
  exported: UnityVerificationExport,
  verifiedAt = new Date().toISOString(),
): VerificationReport {
  const expected = new Map<string, VerificationEdge>();
  const sources = new Map<string, AssetNode>();
  const unresolvedAssets: VerificationReport["unresolvedAssets"] = [];
  const unresolvedDependencies: VerificationReport["unresolvedDependencies"] = [];
  const guidMismatches: VerificationReport["guidMismatches"] = [];

  for (const exportedAsset of exported.assets) {
    const source = store.getNode(exportedAsset.guid);
    if (!source) {
      unresolvedAssets.push({ path: exportedAsset.path, guid: exportedAsset.guid });
      continue;
    }
    sources.set(source.guid, source);
    if (source.origin === "project" && normalizePath(source.path) !== normalizePath(exportedAsset.path)) {
      guidMismatches.push({ path: exportedAsset.path, guid: exportedAsset.guid, indexedPath: source.path });
    }

    for (const dependency of exportedAsset.dependencies) {
      const target = store.getNode(dependency.guid) ?? store.getNodeByPath(normalizePath(dependency.path));
      if (!target) {
        unresolvedDependencies.push({
          fromPath: exportedAsset.path,
          fromGuid: exportedAsset.guid,
          path: dependency.path,
          guid: dependency.guid,
        });
        continue;
      }
      const edge: VerificationEdge = {
        fromGuid: source.guid,
        toGuid: target.guid,
        fromPath: source.path,
        toPath: target.path,
        refKind: kindFor(target.assetType),
        sourceAssetType: source.assetType,
        sourceOrigin: source.origin,
        unityFromPath: exportedAsset.path,
        unityToPath: dependency.path,
      };
      expected.set(pairKey(edge.fromGuid, edge.toGuid), edge);
    }
  }

  const indexed = new Map<string, VerificationEdge>();
  for (const source of sources.values()) {
    for (const edge of store.outgoingEdges(source.guid)) {
      const target = store.getNode(edge.toGuid);
      if (!target) continue;
      const key = pairKey(source.guid, target.guid);
      if (!indexed.has(key)) {
        indexed.set(key, {
          fromGuid: source.guid,
          toGuid: target.guid,
          fromPath: source.path,
          toPath: target.path,
          refKind: edge.refKind,
          sourceAssetType: source.assetType,
          sourceOrigin: source.origin,
        });
      }
    }
  }

  const groups = new Map<string, VerificationGroup>();
  const addGroup = (edge: VerificationEdge, field: keyof Pick<VerificationGroup, "matchedCount" | "missedEdgeCount" | "extraEdgeCount">) => {
    const key = `${edge.sourceAssetType}\u0000${edge.sourceOrigin}\u0000${edge.refKind}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        sourceAssetType: edge.sourceAssetType,
        sourceOrigin: edge.sourceOrigin,
        refKind: edge.refKind,
        matchedCount: 0,
        missedEdgeCount: 0,
        extraEdgeCount: 0,
      };
      groups.set(key, group);
    }
    group[field] += 1;
  };

  const missedEdges: VerificationEdge[] = [];
  let matchedCount = 0;
  for (const [key, edge] of expected) {
    if (indexed.has(key)) {
      matchedCount += 1;
      addGroup(edge, "matchedCount");
    } else {
      missedEdges.push(edge);
      addGroup(edge, "missedEdgeCount");
    }
  }

  const extraEdges: VerificationEdge[] = [];
  for (const [key, edge] of indexed) {
    if (!expected.has(key)) {
      extraEdges.push(edge);
      addGroup(edge, "extraEdgeCount");
    }
  }

  return {
    unityVersion: exported.unityVersion,
    exportedAt: exported.exportedAt,
    verifiedAt,
    unityDependencyCount: expected.size,
    indexedDependencyCount: indexed.size,
    matchedCount,
    coveragePercent: expected.size === 0 ? null : Number(((matchedCount / expected.size) * 100).toFixed(2)),
    missedEdges: missedEdges.sort(compareEdges),
    extraEdges: extraEdges.sort(compareEdges),
    groups: [...groups.values()].sort(compareGroups),
    unresolvedAssets: unresolvedAssets.sort(compareByPath),
    unresolvedDependencies: unresolvedDependencies.sort((a, b) => comparePath(a.fromPath, b.fromPath) || comparePath(a.path, b.path)),
    guidMismatches: guidMismatches.sort(compareByPath),
  };
}

function pairKey(fromGuid: string, toGuid: string): string {
  return `${fromGuid}\u0000${toGuid}`;
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function compareEdges(a: VerificationEdge, b: VerificationEdge): number {
  return comparePath(a.fromPath, b.fromPath) || comparePath(a.toPath, b.toPath);
}

function compareGroups(a: VerificationGroup, b: VerificationGroup): number {
  return (
    comparePath(a.sourceAssetType, b.sourceAssetType) ||
    comparePath(a.sourceOrigin, b.sourceOrigin) ||
    comparePath(a.refKind, b.refKind)
  );
}

function compareByPath(a: { path: string }, b: { path: string }): number {
  return comparePath(a.path, b.path);
}

function comparePath(a: string, b: string): number {
  return a.localeCompare(b);
}
