import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { classifyAssetType, isYamlAsset } from "./asset-type.js";
import { parseGuid, parseImporterType } from "./meta-parse.js";
import { classifyOrigin, parsePackageId } from "./origin.js";
import { matchesAnyGlob } from "../config/glob.js";
import type { AssetNode, ScanResult, ScanWarning } from "./types.js";

const META_SUFFIX = ".meta";

/** The Unity source roots we scan, relative to the project root. */
const SCAN_ROOTS = ["Assets", "Packages", "Library/PackageCache"];

/** Package-manager files at the Packages root that are not Unity assets. */
const NON_ASSET_FILES = new Set(["manifest.json", "packages-lock.json"]);

/**
 * Entries Unity itself does not import (so they carry no `.meta`): hidden
 * dotfiles/dirs (`.DS_Store`, `.signature.p7s`, `.git`, ...), backup `~` files,
 * `cvs`, `.tmp`, and the package-manager manifests. Skipping them keeps
 * missing-meta warnings meaningful.
 */
function isUnityIgnored(name: string): boolean {
  if (name.startsWith(".")) return true;
  if (name.endsWith("~")) return true;
  if (name.endsWith(".tmp")) return true;
  const lower = name.toLowerCase();
  return lower === "cvs" || NON_ASSET_FILES.has(lower);
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
    (config.ignoreDefaults && isUnityIgnored(name)) ||
    matchesAnyGlob(config.ignore, name, relPath);
}

const DEFAULT_IGNORE: IgnorePredicate = (name) => isUnityIgnored(name);

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
  const warnings: ScanWarning[] = [];

  for (const rel of SCAN_ROOTS) {
    const abs = join(projectRoot, rel);
    if (await isDirectory(abs)) {
      await walk(projectRoot, rel, nodes, warnings, ignore);
    }
  }

  return { nodes, warnings };
}

async function walk(
  projectRoot: string,
  relDir: string,
  nodes: AssetNode[],
  warnings: ScanWarning[],
  ignore: IgnorePredicate,
): Promise<void> {
  const entries = await readdir(join(projectRoot, relDir), { withFileTypes: true });
  const names = new Set(entries.map((e) => e.name));

  for (const entry of entries) {
    const relPath = `${relDir}/${entry.name}`;
    if (ignore(entry.name, relPath)) continue;

    if (entry.name.endsWith(META_SUFFIX)) {
      const assetName = entry.name.slice(0, -META_SUFFIX.length);
      if (!names.has(assetName)) {
        warnings.push({
          kind: "orphan-meta",
          path: `${relDir}/${assetName}`,
          message: `.meta has no matching asset: ${relDir}/${assetName}`,
        });
      }
      continue;
    }

    // A non-meta entry is an asset; it must have a sibling `<name>.meta`.
    if (!names.has(entry.name + META_SUFFIX)) {
      warnings.push({
        kind: "missing-meta",
        path: relPath,
        message: `asset has no .meta: ${relPath}`,
      });
    } else {
      const node = await buildNode(projectRoot, relPath, entry.isDirectory(), warnings);
      if (node) nodes.push(node);
    }

    if (entry.isDirectory()) {
      await walk(projectRoot, relPath, nodes, warnings, ignore);
    }
  }
}

async function buildNode(
  projectRoot: string,
  relPath: string,
  isDir: boolean,
  warnings: ScanWarning[],
): Promise<AssetNode | null> {
  const metaContent = await readFile(join(projectRoot, relPath + META_SUFFIX), "utf8");
  const guid = parseGuid(metaContent);
  if (!guid) {
    warnings.push({
      kind: "invalid-meta",
      path: relPath,
      message: `.meta has no parseable guid: ${relPath}${META_SUFFIX}`,
    });
    return null;
  }

  const info = await stat(join(projectRoot, relPath));
  const importerType = isDir ? "folder" : parseImporterType(metaContent);
  const name = relPath.slice(relPath.lastIndexOf("/") + 1);

  return {
    guid,
    path: relPath,
    name,
    assetType: classifyAssetType(relPath, importerType),
    origin: classifyOrigin(relPath),
    packageId: parsePackageId(relPath),
    fileSize: isDir ? null : info.size,
    mtime: Math.floor(info.mtimeMs),
    isBinary: isDir ? true : !isYamlAsset(relPath),
  };
}

async function isDirectory(absPath: string): Promise<boolean> {
  try {
    return (await stat(absPath)).isDirectory();
  } catch {
    return false;
  }
}
