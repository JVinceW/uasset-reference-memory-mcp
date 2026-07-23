# External UPM Package Indexing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically index active local UPM packages stored outside the Unity project while keeping portable `Packages/<name>/...` graph paths.

**Architecture:** Add a package-source discovery unit that converts Unity manifest, lockfile, embedded-package, and cache state into physical-to-virtual scan descriptors. Generalize the metadata scanner and reference reader to use those descriptors, while retaining GUID-first reconciliation and SQLite persistence of portable paths only.

**Tech Stack:** TypeScript 5.7, Node.js 20+, Vitest 2, `node:fs/promises`, `node:path`, `node:crypto`, better-sqlite3.

## Global Constraints

- Discover external roots automatically; add no CLI, MCP, or manual-root setting.
- Follow only local directory sources explicitly declared by `Packages/manifest.json` or resolved as local by `Packages/packages-lock.json`.
- Resolve relative `file:` paths from `<project>/Packages`.
- Store canonical `Packages/<package-name>/...` paths, never absolute or `../` paths.
- Keep external nodes `origin='package'` with the validated package name as `package_id`.
- Apply source precedence: embedded package, active external local package, then matching cache directory.
- Warn and skip inaccessible or invalid individual packages; continue indexing valid roots.
- Preserve fatal duplicate-GUID validation and atomic index publication.
- Do not launch Unity, download packages, scan arbitrary workspace folders, or mutate package content.

---

Date: 2026-07-23

## Status

Completed

## Outcome

A Unity project using a dependency such as
`"com.company.gameplay": "file:../../modules/com.company.gameplay"` receives
nodes and reference edges for that module through normal CLI and MCP indexing.
The resulting database contains virtual Unity paths and remains portable across
machines.

## Context

- Design authority:
  `docs/superpowers/specs/2026-07-23-external-upm-package-indexing-design.md`
- Product behavior: `docs/product/indexing.md`
- Scanner: `src/indexer/meta-scanner.ts`
- Index orchestration and extraction: `src/indexer/index-project.ts`
- Domain types: `src/indexer/types.ts`
- Index-core story:
  `docs/stories/epics/E01-index-core/US-001-project-scan-guid-map.md`

## Scope

In scope:

- Direct relative and absolute local-directory `file:` dependencies.
- Local dependencies represented in Unity's package lockfile.
- Canonical virtual paths, source precedence, warnings, ignore rules,
  cross-boundary references, and incremental reconciliation.
- Portable package-discovery fingerprint metadata.

Out of scope:

- Local `.tgz` files and `file://` Git repository URLs.
- Package downloads, registry resolution, Unity Editor API calls, watchers, and
  non-UPM module roots.
- Database schema or public query API changes.

## File Structure

- Create `src/indexer/package-sources.ts`: parse Unity package metadata, validate
  external package roots, choose one source per package, and return scan roots,
  warnings, and a portable fingerprint.
- Create `src/indexer/package-sources.test.ts`: focused discovery, precedence,
  validation, and fingerprint tests.
- Modify `src/indexer/types.ts`: add transient physical-source information,
  package-discovery warnings, scan descriptors, and optional fingerprint data.
- Modify `src/indexer/meta-scanner.ts`: walk physical roots while constructing
  canonical virtual paths.
- Modify `src/indexer/meta-scanner.test.ts`: prove external physical-to-virtual
  mapping and package identity.
- Modify `src/indexer/scan-ignore.test.ts`: prove ignore rules receive canonical
  external paths.
- Modify `src/indexer/index-project.ts`: read transient source paths during
  reference extraction and persist the discovery fingerprint.
- Modify `src/indexer/index-project-edges.test.ts`: prove cross-boundary edges.
- Modify `src/indexer/index-project.test.ts`: prove external-package incremental
  addition, edit, retarget, and removal behavior.
- Modify `docs/product/indexing.md` and
  `docs/stories/epics/E01-index-core/US-001-project-scan-guid-map.md`: publish
  the expanded contract and validation evidence.

## Approach

### Task 1: Discover and validate active package sources

**Files:**

- Create: `src/indexer/package-sources.ts`
- Create: `src/indexer/package-sources.test.ts`
- Modify: `src/indexer/types.ts`

**Interfaces:**

- Consumes: Unity project root and on-disk `Packages/manifest.json`,
  `Packages/packages-lock.json`, `Packages/*`, and `Library/PackageCache/*`.
- Produces:

```ts
export interface ScanRoot {
  physicalRoot: string;
  virtualRoot: string;
  origin: Exclude<Origin, "builtin">;
  packageId: string | null;
}

export interface PackageDiscoveryResult {
  roots: ScanRoot[];
  warnings: ScanWarning[];
  fingerprint: string;
}

export async function discoverScanRoots(
  projectRoot: string,
): Promise<PackageDiscoveryResult>;
```

- [ ] **Step 1: Add failing discovery tests**

Create table-driven fixtures that write a project manifest plus real
`package.json` files:

```ts
test("discovers a relative external local package with a canonical virtual root", async () => {
  const external = join(root, "..", "modules", "com.company.gameplay");
  await mkdir(external, { recursive: true });
  await writeFile(
    join(external, "package.json"),
    JSON.stringify({ name: "com.company.gameplay", version: "1.0.0" }),
  );
  await writeProjectManifest({
    "com.company.gameplay": "file:../../modules/com.company.gameplay",
  });

  const result = await discoverScanRoots(root);

  expect(result.roots).toContainEqual({
    physicalRoot: external,
    virtualRoot: "Packages/com.company.gameplay",
    origin: "package",
    packageId: "com.company.gameplay",
  });
  expect(result.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  expect(result.fingerprint).not.toContain(external);
});

test("warns and skips a local package whose manifest name does not match", async () => {
  const external = await writeExternalPackage("declared-folder", "com.company.other");
  await writeProjectManifest({ "com.company.gameplay": `file:${external}` });

  const result = await discoverScanRoots(root);

  expect(result.roots.some((scanRoot) =>
    scanRoot.virtualRoot === "Packages/com.company.gameplay")).toBe(false);
  expect(result.warnings).toContainEqual(expect.objectContaining({
    kind: "package-discovery",
    path: "Packages/com.company.gameplay",
    message: expect.stringMatching(/name mismatch/i),
  }));
});

test("prefers embedded, then external, then cache for one package name", async () => {
  await writeEmbeddedPackage("com.company.gameplay");
  await writeExternalDependency("com.company.gameplay");
  await writeCachedPackage("com.company.gameplay@1.0.0", "com.company.gameplay");

  const result = await discoverScanRoots(root);
  const matching = result.roots.filter(
    (scanRoot) => scanRoot.packageId === "com.company.gameplay",
  );

  expect(matching).toHaveLength(1);
  expect(matching[0]!.physicalRoot).toBe(join(root, "Packages", "com.company.gameplay"));
});
```

Add cases for an absolute `file:` directory, a lockfile entry with
`source: "local"`, repeated manifest/lock descriptions, missing
`package.json`, malformed package JSON, an absent/malformed project manifest,
local `.tgz`, `file://` Git URL, and a cache directory excluded by an active
external source.

- [ ] **Step 2: Run the discovery tests and verify RED**

Run:

```powershell
npx vitest run src/indexer/package-sources.test.ts
```

Expected: FAIL because `package-sources.ts`, `ScanRoot`,
`PackageDiscoveryResult`, and the `"package-discovery"` warning kind do not
exist.

- [ ] **Step 3: Add the domain types**

In `src/indexer/types.ts`, add:

```ts
export interface ScanRoot {
  physicalRoot: string;
  /** Forward-slash Unity path used in the graph. */
  virtualRoot: string;
  origin: Exclude<Origin, "builtin">;
  packageId: string | null;
}

export interface PackageDiscoveryResult {
  roots: ScanRoot[];
  warnings: ScanWarning[];
  fingerprint: string;
}
```

Extend `ScanWarningKind` with:

```ts
| "package-discovery"
```

Extend `AssetNode` and `ScanResult` with transient scan information:

```ts
/** Physical path used only during this index run; never stored in SQLite. */
sourcePath?: string;

export interface ScanResult {
  nodes: AssetNode[];
  warnings: ScanWarning[];
  packageFingerprint?: string;
}
```

- [ ] **Step 4: Implement package source discovery**

Create `src/indexer/package-sources.ts` around these exact rules:

```ts
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import type {
  PackageDiscoveryResult,
  ScanRoot,
  ScanWarning,
} from "./types.js";

type Manifest = { dependencies?: Record<string, unknown> };
type LockEntry = { version?: unknown; source?: unknown };
type Lockfile = { dependencies?: Record<string, LockEntry> };

export async function discoverScanRoots(
  projectRoot: string,
): Promise<PackageDiscoveryResult> {
  const warnings: ScanWarning[] = [];
  const roots: ScanRoot[] = [];
  const claimedNonCache = new Set<string>();
  const packagesDir = join(projectRoot, "Packages");
  const manifestText = await readOptional(join(packagesDir, "manifest.json"));
  const lockText = await readOptional(join(packagesDir, "packages-lock.json"));

  if (await isDirectory(join(projectRoot, "Assets"))) {
    roots.push(projectRootScanRoot(projectRoot));
  }

  for (const entry of await childDirectories(packagesDir)) {
    const packageId = await packageName(join(packagesDir, entry)) ?? entry;
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

  for (const entry of await childDirectories(join(projectRoot, "Library", "PackageCache"))) {
    const physicalRoot = join(projectRoot, "Library", "PackageCache", entry);
    const activeName = await packageName(physicalRoot) ?? stripCacheVersion(entry);
    if (claimedNonCache.has(activeName)) continue;
    roots.push(packageScanRoot(physicalRoot, entry, true));
  }

  const fingerprint = createHash("sha256")
    .update(manifestText ?? "")
    .update("\0")
    .update(lockText ?? "")
    .update("\0")
    .update(roots.map((root) =>
      `${root.virtualRoot}\0${resolve(root.physicalRoot)}`).sort().join("\0"))
    .digest("hex");
  return { roots, warnings, fingerprint };
}
```

Implement the referenced helpers in the same file with these contracts:

- `projectRootScanRoot(projectRoot)` returns the physical `Assets` directory,
  virtual root `"Assets"`, project origin, and null package ID.
- `packageScanRoot(path, id, cached)` returns virtual
  `Library/PackageCache/<id>` when cached, otherwise `Packages/<id>`.
- `readOptional` returns `null` for absent/inaccessible files.
- `parseJson` accepts a `required` boolean. Absent required manifest input and
  malformed input append one `"package-discovery"` warning at
  `Packages/manifest.json` or `Packages/packages-lock.json`; an absent optional
  lockfile returns an empty object without warning.
- `childDirectories` returns a lexicographically sorted empty array when the
  directory is absent.
- `localCandidates` accepts only `source === "local"` lock entries and direct
  manifest strings beginning with `file:`; it rejects `.tgz` and `file://`,
  resolves relative paths from `packagesDir`, and lets the direct manifest
  value win for duplicate names.
- `packageName` returns the non-empty string `name` from `package.json`, or
  null.
- `stripCacheVersion("com.company.gameplay@1.2.3")` returns
  `"com.company.gameplay"`.
- `packageWarning(name, detail)` uses virtual path `Packages/<name>` and never
  puts the raw physical root in its message.

- [ ] **Step 5: Run discovery tests and the type checker**

Run:

```powershell
npx vitest run src/indexer/package-sources.test.ts
npm run typecheck
```

Expected: the focused test file passes and TypeScript reports no errors.

- [ ] **Step 6: Commit package discovery**

```powershell
git add -- src/indexer/types.ts src/indexer/package-sources.ts src/indexer/package-sources.test.ts
git commit -m "feat: discover external UPM package roots"
```

### Task 2: Scan physical roots into canonical Unity paths

**Files:**

- Modify: `src/indexer/meta-scanner.ts`
- Modify: `src/indexer/meta-scanner.test.ts`
- Modify: `src/indexer/scan-ignore.test.ts`

**Interfaces:**

- Consumes: `discoverScanRoots(projectRoot): Promise<PackageDiscoveryResult>`.
- Produces: unchanged public
  `scanProject(projectRoot, ignore?): Promise<ScanResult>`, with nodes carrying
  transient `sourcePath` and results carrying `packageFingerprint`.

- [ ] **Step 1: Add failing scanner tests**

Add a fixture with a project beside an external module:

```ts
test("maps an external package physical root to a canonical Unity path", async () => {
  const external = await writeExternalPackage("com.company.gameplay");
  await writeProjectManifest({
    "com.company.gameplay": `file:${external.replaceAll("\\", "/")}`,
  });
  await writePackageAsset(
    external,
    "Runtime/Rules.asset",
    "f".repeat(32),
  );

  const scanned = await scanProject(root);
  const node = scanned.nodes.find((candidate) => candidate.guid === "f".repeat(32));

  expect(node).toMatchObject({
    path: "Packages/com.company.gameplay/Runtime/Rules.asset",
    origin: "package",
    packageId: "com.company.gameplay",
    sourcePath: join(external, "Runtime", "Rules.asset"),
  });
  expect(scanned.packageFingerprint).toMatch(/^[0-9a-f]{64}$/);
});
```

In `src/indexer/scan-ignore.test.ts`, add:

```ts
test("matches ignores against an external package's canonical path", async () => {
  const external = await externalPackageWithAsset("com.company.gameplay", "Editor/Debug.asset");
  const scanned = await scanProject(
    root,
    buildIgnore({
      ignore: ["Packages/com.company.gameplay/Editor/**"],
      ignoreDefaults: true,
    }),
  );

  expect(scanned.nodes.some((node) => node.name === "Debug.asset")).toBe(false);
  expect(scanned.warnings.some((warning) => warning.path.includes("Debug.asset"))).toBe(false);
});
```

- [ ] **Step 2: Run scanner tests and verify RED**

Run:

```powershell
npx vitest run src/indexer/meta-scanner.test.ts src/indexer/scan-ignore.test.ts
```

Expected: FAIL because `scanProject` still joins every path to `projectRoot` and
does not discover external descriptors.

- [ ] **Step 3: Generalize the scanner**

In `src/indexer/meta-scanner.ts`:

```ts
import { discoverScanRoots } from "./package-sources.js";
import type {
  AssetNode,
  ScanResult,
  ScanRoot,
  ScanWarning,
} from "./types.js";
```

Replace `SCAN_ROOTS` and the current `scanProject` loop with:

```ts
export async function scanProject(
  projectRoot: string,
  ignore: IgnorePredicate = DEFAULT_IGNORE,
): Promise<ScanResult> {
  const nodes: AssetNode[] = [];
  const discovery = await discoverScanRoots(projectRoot);
  const warnings = [...discovery.warnings];

  for (const root of discovery.roots) {
    await walk(root, "", nodes, warnings, ignore);
  }

  return {
    nodes,
    warnings,
    packageFingerprint: discovery.fingerprint,
  };
}
```

Change the private walk/build boundary to:

```ts
async function walk(
  root: ScanRoot,
  relativeDir: string,
  nodes: AssetNode[],
  warnings: ScanWarning[],
  ignore: IgnorePredicate,
): Promise<void>;

async function buildNode(
  root: ScanRoot,
  relativePath: string,
  isDir: boolean,
  warnings: ScanWarning[],
): Promise<AssetNode | null>;
```

Inside both functions, derive paths only through:

```ts
const sourceDirectory = relativeDir
  ? join(root.physicalRoot, relativeDir)
  : root.physicalRoot;
const virtualDirectory = relativeDir
  ? `${root.virtualRoot}/${relativeDir.replaceAll("\\", "/")}`
  : root.virtualRoot;
const sourcePath = join(root.physicalRoot, relativePath);
const virtualPath = `${root.virtualRoot}/${relativePath.replaceAll("\\", "/")}`;
```

Use `virtualPath` for warnings, ignore predicates, type classification, node
`path`, and node `name`. Use `sourcePath` for `readFile` and `stat`. Assign
`origin: root.origin`, `packageId: root.packageId`, and `sourcePath`.

- [ ] **Step 4: Run scanner and legacy package tests**

Run:

```powershell
npx vitest run src/indexer/meta-scanner.test.ts src/indexer/scan-ignore.test.ts src/indexer/origin.test.ts src/indexer/packages.test.ts
npm run typecheck
```

Expected: all focused tests pass; the existing embedded and cache origin/path
contracts remain green.

- [ ] **Step 5: Commit canonical multi-root scanning**

```powershell
git add -- src/indexer/meta-scanner.ts src/indexer/meta-scanner.test.ts src/indexer/scan-ignore.test.ts
git commit -m "feat: scan external packages with virtual paths"
```

### Task 3: Extract references and reconcile external packages

**Files:**

- Modify: `src/indexer/index-project.ts`
- Modify: `src/indexer/index-project-edges.test.ts`
- Modify: `src/indexer/index-project.test.ts`

**Interfaces:**

- Consumes: `AssetNode.sourcePath` and `ScanResult.packageFingerprint`.
- Produces: graph edges for external YAML and SQLite metadata key
  `package_discovery_fingerprint`.

- [ ] **Step 1: Add a failing cross-boundary reference test**

In `src/indexer/index-project-edges.test.ts`, construct a project prefab that
references an external package material:

```ts
test("resolves project references to an external local package", async () => {
  const external = await externalPackage("com.company.materials");
  await packageMaterial(external, MAT);
  await projectManifest({
    "com.company.materials": `file:${external.replaceAll("\\", "/")}`,
  });
  await prefabRefs("a".repeat(32), MAT);

  const summary = await indexProject(root, { dbPath });

  expect(summary.edgeCount).toBe(1);
  const store = GraphStore.open(dbPath);
  expect(store.getNode(MAT)).toMatchObject({
    path: "Packages/com.company.materials/Runtime/body.mat",
    origin: "package",
    packageId: "com.company.materials",
  });
  store.close();
});
```

Expected behavior depends on reading the transient physical source path; the
absolute external path must not appear in the stored node.

- [ ] **Step 2: Add failing incremental reconciliation tests**

In `src/indexer/index-project.test.ts`, add `utimes` to its
`node:fs/promises` import and add:

```ts
test("updates and removes external package assets incrementally", async () => {
  const external = await externalPackage("com.company.gameplay");
  await projectManifest({
    "com.company.gameplay": `file:${external.replaceAll("\\", "/")}`,
  });
  await packageAsset(external, "Runtime/Rules.asset", "a".repeat(32), "value: 1");
  await indexProject(root, { dbPath });

  await packageAsset(external, "Runtime/Rules.asset", "a".repeat(32), "value: 2");
  const advanced = new Date(Date.now() + 2_000);
  await utimes(join(external, "Runtime", "Rules.asset"), advanced, advanced);
  const changed = await indexProject(root, { dbPath });
  expect(changed.updated).toBe(1);

  await rm(join(external, "Runtime", "Rules.asset"));
  await rm(join(external, "Runtime", "Rules.asset.meta"));
  const removed = await indexProject(root, { dbPath });
  expect(removed.removed).toBe(1);
});

test("reconciles a retargeted local dependency and records its fingerprint", async () => {
  const first = await externalPackage("com.company.gameplay", "a".repeat(32));
  const second = await externalPackage("com.company.gameplay", "b".repeat(32));
  await projectManifest({ "com.company.gameplay": `file:${first}` });
  await indexProject(root, { dbPath });
  const firstStore = GraphStore.open(dbPath);
  const firstFingerprint = firstStore.getMeta("package_discovery_fingerprint");
  firstStore.close();

  await projectManifest({ "com.company.gameplay": `file:${second}` });
  const summary = await indexProject(root, { dbPath });
  const store = GraphStore.open(dbPath);

  expect(summary.added).toBe(1);
  expect(summary.removed).toBe(1);
  expect(store.getMeta("package_discovery_fingerprint")).not.toBe(firstFingerprint);
  expect(store.getNode("b".repeat(32))).not.toBeNull();
  expect(store.getNode("a".repeat(32))).toBeNull();
  store.close();
});
```

Ensure every temporary `GraphStore` is closed immediately after reading
metadata so Windows can replace the database.

- [ ] **Step 3: Run index tests and verify RED**

Run:

```powershell
npx vitest run src/indexer/index-project-edges.test.ts src/indexer/index-project.test.ts
```

Expected: external nodes may be found, but extraction reports
`unreadable-asset` because it tries
`join(projectRoot, "Packages/<name>/...")`; fingerprint assertions also fail.

- [ ] **Step 4: Read transient physical paths and store the fingerprint**

In `extractAll` within `src/indexer/index-project.ts`, replace the read target:

```ts
const sourcePath = node.sourcePath ?? join(projectRoot, node.path);
try {
  content = await readFile(sourcePath, "utf8");
} catch {
  warnings.push({
    kind: "unreadable-asset",
    path: node.path,
    message: `could not read asset for reference extraction: ${node.path}`,
  });
  continue;
}
```

After existing index metadata is set, add:

```ts
if (result.packageFingerprint) {
  store.setMeta("package_discovery_fingerprint", result.packageFingerprint);
}
```

Do not add `sourcePath` to `GraphStore.upsertNodes`, the database schema, JSON
snapshots, MCP results, or web results.

- [ ] **Step 5: Run focused indexing tests**

Run:

```powershell
npx vitest run src/indexer/index-project-edges.test.ts src/indexer/index-project.test.ts src/indexer/guid-validation.test.ts
npm run typecheck
```

Expected: cross-boundary edges, edits, removals, retargeting, duplicate-GUID
failure, and atomic replacement tests pass.

- [ ] **Step 6: Commit indexing integration**

```powershell
git add -- src/indexer/index-project.ts src/indexer/index-project-edges.test.ts src/indexer/index-project.test.ts
git commit -m "feat: index external UPM package references"
```

### Task 4: Publish the contract and run repository validation

**Files:**

- Modify: `docs/product/indexing.md`
- Modify:
  `docs/stories/epics/E01-index-core/US-001-project-scan-guid-map.md`
- Modify: `docs/plans/active/2026-07-23-external-upm-package-indexing.md`
- Move after validation:
  `docs/plans/active/2026-07-23-external-upm-package-indexing.md` to
  `docs/plans/completed/2026-07-23-external-upm-package-indexing.md`

**Interfaces:**

- Consumes: validated behavior from Tasks 1-3.
- Produces: current product/story truth and a completed execution record.

- [ ] **Step 1: Update product indexing documentation**

Add an `External local UPM packages` row to the scan-scope table:

```md
| External local UPM package | nodes + outgoing edges | `package` | Auto-discovered from Unity manifest/lock metadata; stored as `Packages/<name>/...` |
```

Document source precedence, bounded discovery warnings, relative-path
resolution from `Packages/`, transient physical paths, and the
`package_discovery_fingerprint` metadata. State explicitly that `.tgz`,
`file://` Git, downloads, and arbitrary extra roots are excluded.

- [ ] **Step 2: Update the index-core story**

Extend US-001 acceptance criteria with:

```md
- Active local UPM directory dependencies outside the project are discovered
  automatically from Unity package metadata.
- External package assets use canonical `Packages/<package-name>/...` paths;
  absolute physical paths are not persisted.
- Embedded packages override external and cached copies of the same package.
- Project/package reference extraction crosses external package boundaries.
```

Replace stale evidence counts with the commands and observed results from the
current run.

- [ ] **Step 3: Run the complete validation suite**

Run:

```powershell
npm test
npm run typecheck
npm run build
npm pack --dry-run
npm pack --dry-run --prefix unity/com.jvincew.assetreferencememory
git diff --check
```

Expected:

- all Vitest files pass;
- TypeScript typecheck and production build exit 0;
- both package dry-runs list only intended distributable files and exit 0;
- `git diff --check` prints no whitespace errors.

- [ ] **Step 4: Inspect the final change boundary**

Run:

```powershell
git status --short
git diff --stat HEAD
git diff HEAD -- src/indexer docs/product/indexing.md docs/stories/epics/E01-index-core/US-001-project-scan-guid-map.md
```

Expected: only the files named by this plan are changed; no generated database,
package lock churn, tarball, or unrelated documentation is included.

- [ ] **Step 5: Complete the execution record**

In this plan, record exact test counts and command outcomes under `Validation`,
summarize the implementation under `Result`, set `Status` to `Completed`, and
move the file:

```powershell
Move-Item -LiteralPath 'docs/plans/active/2026-07-23-external-upm-package-indexing.md' -Destination 'docs/plans/completed/2026-07-23-external-upm-package-indexing.md'
```

- [ ] **Step 6: Commit documentation and completion evidence**

```powershell
git add -- docs/product/indexing.md docs/stories/epics/E01-index-core/US-001-project-scan-guid-map.md docs/plans/completed/2026-07-23-external-upm-package-indexing.md
git commit -m "docs: document external UPM indexing"
```

## Risks And Recovery

- **Unity lockfile variants:** tolerate absent/unknown fields, prefer validated
  direct manifest declarations, and cover known local-source shapes with table
  tests.
- **Machine-specific paths:** use them only for live reads; store virtual paths
  and a digest, not raw absolute roots.
- **Duplicate scans:** package-name precedence chooses one active physical root,
  followed by existing fatal GUID validation.
- **Windows database/file locks:** close every test store before reindex or
  cleanup; keep atomic temp-database publication unchanged.
- **Regression recovery:** revert the task commit that introduced the failing
  boundary. Existing indexes remain usable because no schema migration occurs
  and failed indexing never replaces the prior database.

## Progress

- [x] Design approved and committed as `9cbb7e8`.
- [x] Task 1: Discover and validate active package sources.
- [x] Task 2: Scan physical roots into canonical Unity paths.
- [x] Task 3: Extract references and reconcile external packages.
- [x] Task 4: Publish the contract and run repository validation.

## Decisions

- 2026-07-23: Automatic discovery is the default; no manual additional-root
  configuration is introduced.
- 2026-07-23: Unity virtual package paths are graph identity; physical paths are
  transient read locations.
- 2026-07-23: The standalone CLI parses manifest/lock metadata instead of
  depending on the Unity Editor API.
- 2026-07-23: Package-name precedence prevents local/cache duplicates; GUID
  validation remains the final collision boundary.

## Validation

- Focused proof: `src/indexer/package-sources.test.ts` (20 tests),
  `meta-scanner.test.ts` (14), `scan-ignore.test.ts` (4),
  `index-project-edges.test.ts` (6), and `index-project.test.ts` (25) pass as
  part of the full suite.
- `npm test` — exit 0; 39 test files and 289 tests passed.
- `npm run typecheck` — exit 0.
- `npm run build` — exit 0.
- `npm pack --dry-run` — exit 0; 125 intended distributable files.
- `npm pack --dry-run --prefix unity/com.jvincew.assetreferencememory` — exit
  0; 125 intended distributable files.
- `git diff --check` — exit 0; no whitespace errors.
- Final boundary inspection found only the two documentation files pending this
  execution record; no generated database, lockfile churn, tarball, or
  unrelated documentation was present.

## Result

Implemented automatic discovery of active local UPM directory dependencies,
canonical physical-to-virtual scanning, cross-package reference extraction, and
portable package-discovery fingerprint persistence. Published the product and
story contract, then completed repository validation. This plan was promoted to
`docs/plans/completed/` after the checks above passed.
