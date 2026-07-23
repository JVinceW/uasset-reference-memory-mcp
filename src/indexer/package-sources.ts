import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import type { PackageDiscoveryResult, ScanRoot, ScanWarning } from "./types.js";

type Manifest = { dependencies?: Record<string, unknown> };
type LockEntry = { version?: unknown; source?: unknown };
type Lockfile = { dependencies?: Record<string, LockEntry> };

export async function discoverScanRoots(projectRoot: string): Promise<PackageDiscoveryResult> {
  const warnings: ScanWarning[] = [];
  const roots: ScanRoot[] = [];
  const claimedNonCache = new Set<string>();
  const packagesDir = join(projectRoot, "Packages");
  const manifestText = await readOptional(join(packagesDir, "manifest.json"));
  const lockText = await readOptional(join(packagesDir, "packages-lock.json"));

  if (await isDirectory(join(projectRoot, "Assets"))) roots.push(projectRootScanRoot(projectRoot));

  for (const entry of await childDirectories(packagesDir)) {
    const packageId = (await packageName(join(packagesDir, entry))) ?? entry;
    roots.push(packageScanRoot(join(packagesDir, entry), packageId, false));
    claimedNonCache.add(packageId);
  }

  const candidates = localCandidates(
    packagesDir,
    parseJson<Manifest>(manifestText, "manifest", warnings, true),
    parseJson<Lockfile>(lockText, "lockfile", warnings, false),
  );
  for (const [declaredName, physicalRoot] of candidates) {
    if (claimedNonCache.has(declaredName)) continue;
    const actualName = await packageName(physicalRoot);
    if (actualName !== declaredName) {
      warnings.push(packageWarning(
        declaredName,
        actualName === null
          ? "package.json is missing or malformed"
          : `package.json name mismatch: expected ${declaredName}, got ${actualName}`,
      ));
      continue;
    }
    roots.push(packageScanRoot(physicalRoot, declaredName, false));
    claimedNonCache.add(declaredName);
  }

  const cacheDir = join(projectRoot, "Library", "PackageCache");
  for (const entry of await childDirectories(cacheDir)) {
    const physicalRoot = join(cacheDir, entry);
    const activeName = (await packageName(physicalRoot)) ?? stripCacheVersion(entry);
    if (claimedNonCache.has(activeName)) continue;
    roots.push(packageScanRoot(physicalRoot, entry, true));
  }

  const fingerprint = createHash("sha256")
    .update(manifestText ?? "")
    .update("\0")
    .update(lockText ?? "")
    .update("\0")
    .update(roots.map((root) => `${root.virtualRoot}\0${resolve(root.physicalRoot)}`).sort().join("\0"))
    .digest("hex");
  return { roots, warnings, fingerprint };
}

function projectRootScanRoot(projectRoot: string): ScanRoot {
  return { physicalRoot: join(projectRoot, "Assets"), virtualRoot: "Assets", origin: "project", packageId: null };
}

function packageScanRoot(path: string, id: string, cached: boolean): ScanRoot {
  return {
    physicalRoot: path,
    virtualRoot: cached ? `Library/PackageCache/${id}` : `Packages/${id}`,
    origin: "package",
    packageId: id,
  };
}

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

function parseJson<T>(text: string | null, name: "manifest" | "lockfile", warnings: ScanWarning[], required: boolean): T {
  const path = name === "manifest" ? "Packages/manifest.json" : "Packages/packages-lock.json";
  if (text === null) {
    if (required) warnings.push({ kind: "package-discovery", path, message: `${name} is missing or unreadable` });
    return {} as T;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      warnings.push({ kind: "package-discovery", path, message: `${name} must contain a JSON object` });
      return {} as T;
    }
    return parsed as T;
  } catch {
    warnings.push({ kind: "package-discovery", path, message: `${name} contains malformed JSON` });
    return {} as T;
  }
}

async function childDirectories(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
}

function localCandidates(packagesDir: string, manifest: Manifest, lockfile: Lockfile): Map<string, string> {
  const candidates = new Map<string, string>();
  for (const [name, entry] of Object.entries(lockfile.dependencies ?? {})) {
    if (entry?.source === "local" && typeof entry.version === "string") {
      const path = localDirectory(packagesDir, entry.version);
      if (path !== null) candidates.set(name, path);
    }
  }
  for (const [name, value] of Object.entries(manifest.dependencies ?? {})) {
    if (typeof value !== "string") continue;
    const path = localDirectory(packagesDir, value);
    if (path !== null) candidates.set(name, path);
  }
  return candidates;
}

function localDirectory(packagesDir: string, value: string): string | null {
  if (!value.startsWith("file:") || value.startsWith("file://")) return null;
  const target = value.slice("file:".length);
  if (target.toLowerCase().endsWith(".tgz")) return null;
  return isAbsolute(target) ? target : resolve(packagesDir, target);
}

async function packageName(path: string): Promise<string | null> {
  if (!(await isDirectory(path))) return null;
  const text = await readOptional(join(path, "package.json"));
  if (text === null) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) return null;
    const name = (parsed as { name?: unknown }).name;
    return typeof name === "string" && name.length > 0 ? name : null;
  } catch {
    return null;
  }
}

function stripCacheVersion(name: string): string {
  const at = name.lastIndexOf("@");
  return at > 0 ? name.slice(0, at) : name;
}

function packageWarning(name: string, detail: string): ScanWarning {
  return { kind: "package-discovery", path: `Packages/${name}`, message: `Package ${name}: ${detail}` };
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}
