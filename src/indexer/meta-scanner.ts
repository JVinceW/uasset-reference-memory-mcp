import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { classifyAssetType, isYamlAsset } from "./asset-type.js";
import { parseGuid, parseImporterType } from "./meta-parse.js";
import { discoverScanRoots } from "./package-sources.js";
import { matchesAnyGlob } from "../config/glob.js";
import type { AssetNode, ScanResult, ScanRoot, ScanWarning } from "./types.js";

const META_SUFFIX = ".meta";

/** Package-manager files at the Packages root that are not Unity assets. */
const NON_ASSET_FILES = new Set(["manifest.json", "packages-lock.json"]);

/**
 * Entries Unity itself does not import (so they carry no `.meta`): hidden
 * dotfiles/dirs (`.DS_Store`, `.signature.p7s`, `.git`, ...), backup `~` files,
 * `cvs`, `.tmp`, and the package-manager manifests. Skipping them keeps
 * missing-meta warnings meaningful.
 */
function isUnityIgnored(name: string, virtualPath: string): boolean {
  if (name.startsWith(".")) return true;
  if (name.endsWith("~")) return true;
  if (name.endsWith(".tmp")) return true;
  if (name === "package.json" && isPackageRootMetadata(virtualPath)) return true;
  const lower = name.toLowerCase();
  return lower === "cvs" || NON_ASSET_FILES.has(lower);
}

function isPackageRootMetadata(virtualPath: string): boolean {
  const segments = virtualPath.split("/");
  return (segments.length === 3 && segments[0] === "Packages") ||
    (segments.length === 4 && segments[0] === "Library" && segments[1] === "PackageCache");
}

/** Predicate deciding whether a directory entry is skipped during the scan. */
export type IgnorePredicate = (name: string, relPath: string) => boolean;

export interface ScanIgnoreConfig {
  ignore: string[];
  ignoreDefaults: boolean;
}

/** Build the scan ignore predicate: built-in Unity rules + user glob patterns. */
export function buildIgnore(config: ScanIgnoreConfig): IgnorePredicate {
  return (name, relPath) =>
    (config.ignoreDefaults && isUnityIgnored(name, relPath)) ||
    matchesAnyGlob(config.ignore, name, relPath);
}

const DEFAULT_IGNORE: IgnorePredicate = (name, relPath) => isUnityIgnored(name, relPath);

/**
 * Walk a Unity project and produce one asset node per asset that carries a
 * `.meta` (US-001, the meta-scanner). Emits warnings for metas without assets,
 * assets without metas, and metas without a parseable guid, rather than throwing.
 */
export async function scanProject(
  projectRoot: string,
  ignore: IgnorePredicate = DEFAULT_IGNORE,
): Promise<ScanResult> {
  const nodes: AssetNode[] = [];
  const discovery = await discoverScanRoots(projectRoot);
  const warnings = [...discovery.warnings];

  for (const root of discovery.roots) {
    const rootName = root.virtualRoot.slice(root.virtualRoot.lastIndexOf("/") + 1);
    if (ignore(rootName, root.virtualRoot)) continue;
    await walk(root, "", nodes, warnings, ignore);
  }

  return {
    nodes,
    warnings,
    packageFingerprint: discovery.fingerprint,
  };
}

async function walk(
  root: ScanRoot,
  relativeDir: string,
  nodes: AssetNode[],
  warnings: ScanWarning[],
  ignore: IgnorePredicate,
): Promise<void> {
  const sourceDirectory = relativeDir
    ? join(root.physicalRoot, relativeDir)
    : root.physicalRoot;
  const virtualDirectory = relativeDir
    ? `${root.virtualRoot}/${relativeDir.replaceAll("\\", "/")}`
    : root.virtualRoot;
  const entries = await readdir(sourceDirectory, { withFileTypes: true });
  const names = new Set(entries.map((e) => e.name));

  for (const entry of entries) {
    const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
    const virtualPath = `${virtualDirectory}/${entry.name.replaceAll("\\", "/")}`;
    if (ignore(entry.name, virtualPath)) continue;

    if (entry.name.endsWith(META_SUFFIX)) {
      const assetName = entry.name.slice(0, -META_SUFFIX.length);
      if (!names.has(assetName)) {
        warnings.push({
          kind: "orphan-meta",
          path: virtualPath.slice(0, -META_SUFFIX.length),
          message: `.meta has no matching asset: ${virtualPath.slice(0, -META_SUFFIX.length)}`,
        });
      }
      continue;
    }

    // A non-meta entry is an asset; it must have a sibling `<name>.meta`.
    if (!names.has(entry.name + META_SUFFIX)) {
      warnings.push({
        kind: "missing-meta",
        path: virtualPath,
        message: `asset has no .meta: ${virtualPath}`,
      });
    } else {
      const node = await buildNode(root, relativePath, entry.isDirectory(), warnings);
      if (node) nodes.push(node);
    }

    if (entry.isDirectory()) {
      await walk(root, relativePath, nodes, warnings, ignore);
    }
  }
}

async function buildNode(
  root: ScanRoot,
  relativePath: string,
  isDir: boolean,
  warnings: ScanWarning[],
): Promise<AssetNode | null> {
  const sourcePath = join(root.physicalRoot, relativePath);
  const virtualPath = `${root.virtualRoot}/${relativePath.replaceAll("\\", "/")}`;
  const metaPath = `${sourcePath}${META_SUFFIX}`;
  const metaContent = await readFile(metaPath, "utf8");
  const guid = parseGuid(metaContent);
  if (!guid) {
    warnings.push({
      kind: "invalid-meta",
      path: virtualPath,
      message: `.meta has no parseable guid: ${virtualPath}${META_SUFFIX}`,
    });
    return null;
  }

  const [info, metaInfo] = await Promise.all([stat(sourcePath), stat(metaPath)]);
  const importerType = isDir ? "folder" : parseImporterType(metaContent);
  const name = virtualPath.slice(virtualPath.lastIndexOf("/") + 1);

  return {
    guid,
    path: virtualPath,
    name,
    assetType: classifyAssetType(virtualPath, importerType),
    origin: root.origin,
    packageId: root.packageId,
    fileSize: isDir ? null : info.size,
    mtime: Math.max(Math.floor(info.mtimeMs), Math.floor(metaInfo.mtimeMs)),
    isBinary: isDir ? true : !isYamlAsset(virtualPath),
    sourcePath,
  };
}
