# Meta-Aware Incremental Reindex Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect normal `.meta`-only edits as updates to the existing logical Unity asset during incremental indexing.

**Architecture:** Preserve one `AssetNode` and one SQLite asset row per Unity asset. At the scanner boundary, stat the asset and sibling `.meta`, collapse their timestamps into the existing `mtime` field with `Math.max`, and leave incremental comparison and schema 3 unchanged.

**Tech Stack:** TypeScript 5.7, Node.js filesystem promises, SQLite via better-sqlite3, Vitest 2.1.

**Release Target:** `0.3.1` patch release.

Date: 2026-07-22

## Status

Active

## Outcome

After implementation, changing only `Assets/X.ext.meta` causes the next normal
`index_project` call to report `X.ext` as updated while the database still
contains exactly one logical row for the asset.

## Context

- Design: `docs/superpowers/specs/2026-07-22-meta-aware-incremental-reindex-design.md`
- Decision: `docs/decisions/0011-one-logical-asset-meta-aware-freshness.md`
- Product behavior: `docs/product/indexing.md`
- Scanner: `src/indexer/meta-scanner.ts`
- Incremental classifier: `src/indexer/index-project.ts`
- Scanner proof: `src/indexer/meta-scanner.test.ts`
- End-to-end index proof: `src/indexer/index-project.test.ts`

## Global Constraints

- Keep the asset and sibling `.meta` as one logical database row.
- Use `max(floor(asset.mtimeMs), floor(meta.mtimeMs))` as the existing `mtime` value.
- Do not bump schema 3 or add a database column.
- Do not create queryable `.meta` nodes.
- Do not change MCP or CLI arguments and response shapes.
- Do not include move/rename, manual GUID replacement reconciliation, hashes,
  watchers, or automatic agent-triggered indexing.

---

### Task 1: Make Scanner Freshness Include the Sibling Meta File

**Files:**
- Modify: `src/indexer/meta-scanner.ts`
- Modify: `src/indexer/meta-scanner.test.ts`
- Modify: `src/indexer/index-project.test.ts`
- Modify: `docs/product/indexing.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: `AssetNode.mtime: number` and the existing path-based incremental comparison.
- Produces: the same `AssetNode` shape, with `mtime` equal to the newer asset/meta timestamp.

- [ ] **Step 1: Add a failing scanner regression for the effective timestamp**

Add `utimes` to the `node:fs/promises` import in
`src/indexer/meta-scanner.test.ts`, then add this focused test:

```ts
test("uses the newer asset or meta mtime for one logical node", async () => {
  const caseRoot = await mkdtemp(join(tmpdir(), "asset-meta-mtime-"));
  try {
    await mkdir(join(caseRoot, "Assets"), { recursive: true });
    const assetPath = join(caseRoot, "Assets/Config.asset");
    const metaPath = `${assetPath}.meta`;
    await writeFile(assetPath, "%YAML 1.1\n--- !u!114 &1\n");
    await writeFile(metaPath, meta("1".repeat(32), { importer: "NativeFormatImporter" }));

    const assetTime = new Date("2026-07-22T00:00:00.000Z");
    const metaTime = new Date("2026-07-22T00:01:00.000Z");
    await utimes(assetPath, assetTime, assetTime);
    await utimes(metaPath, metaTime, metaTime);

    const scanned = await scanProject(caseRoot);
    expect(scanned.nodes).toHaveLength(1);
    expect(scanned.nodes[0]?.mtime).toBe(metaTime.getTime());
  } finally {
    await rm(caseRoot, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the scanner test and observe the red state**

Run:

```powershell
npx vitest run src/indexer/meta-scanner.test.ts
```

Expected: the new test fails because the scanner currently stores only the
older asset timestamp.

- [ ] **Step 3: Implement the effective timestamp at the scanner boundary**

In `buildNode`, reuse explicit asset and meta paths and stat them together:

```ts
const assetPath = join(projectRoot, relPath);
const metaPath = `${assetPath}${META_SUFFIX}`;
const metaContent = await readFile(metaPath, "utf8");
// Preserve the existing invalid-guid warning and return behavior.
const [info, metaInfo] = await Promise.all([stat(assetPath), stat(metaPath)]);
```

Keep `fileSize` sourced from `info.size`, and replace the existing timestamp
assignment with:

```ts
mtime: Math.max(Math.floor(info.mtimeMs), Math.floor(metaInfo.mtimeMs)),
```

- [ ] **Step 4: Run the scanner proof and observe green**

Run:

```powershell
npx vitest run src/indexer/meta-scanner.test.ts
```

Expected: all scanner tests pass, including the newer-meta regression and the
existing one-node-per-asset assertion.

- [ ] **Step 5: Add an incremental integration regression**

Use the existing `utimes` import in `src/indexer/index-project.test.ts`. In the
`indexProject incremental` suite, add a test that indexes one asset, advances
only its `.meta` timestamp, and indexes again:

```ts
test("treats a meta-only timestamp change as one updated asset", async () => {
  await writeAsset("Assets/MetaChanged.asset", "9".repeat(32));
  await indexProject(root, { dbPath });

  const future = new Date(Date.now() + 60_000);
  await utimes(
    join(root, "Assets/MetaChanged.asset.meta"),
    future,
    future,
  );

  const summary = await indexProject(root, { dbPath });
  expect(summary).toMatchObject({
    added: 0,
    updated: 1,
    removed: 0,
  });

  const store = GraphStore.open(dbPath);
  expect(store.getNode("9".repeat(32))?.path).toBe(
    "Assets/MetaChanged.asset",
  );
  expect(store.assetCount()).toBe(3); // logical asset + 2 builtins
  store.close();
});
```

If suite-level fixtures retain assets between tests, use the suite's existing
per-test cleanup/helper pattern and assert the count delta rather than a global
absolute count. Do not weaken the one-logical-row assertion.

- [ ] **Step 6: Run focused incremental proof**

Run:

```powershell
npx vitest run src/indexer/meta-scanner.test.ts src/indexer/index-project.test.ts
```

Expected: both files pass; the second index reports one update caused solely by
the sibling `.meta` timestamp.

- [ ] **Step 7: Update the documented freshness contract**

In `docs/product/indexing.md`, replace the asset-only wording with:

```markdown
Default `index_project` is incremental. Each Unity asset and its sibling
`.meta` remain one logical row; freshness uses the newer of their filesystem
modification times. Only rows whose effective time differs are reparsed.
`force: true` rebuilds from scratch.
```

In the README limitation, state that incremental re-index uses the newest
asset/`.meta` timestamp and that timestamp-preserving synchronization still
requires `--force`.

- [ ] **Step 8: Run the repository verification ladder**

Run:

```powershell
npm test
npm run typecheck
npm run build
git diff --check
```

Expected: every command exits 0. Review `git diff --stat` and confirm changes
remain limited to the scanner, focused tests, and freshness documentation.

- [ ] **Step 9: Commit the implementation**

```powershell
git add src/indexer/meta-scanner.ts src/indexer/meta-scanner.test.ts src/indexer/index-project.test.ts docs/product/indexing.md README.md
git commit -m "fix: detect meta-only asset changes"
```

Use `git status --short` afterward. Expected: no tracked implementation drift.

## Risks And Recovery

- A future-dated asset timestamp can temporarily mask an older `.meta`
  timestamp. Use `index_project(force: true)` when timestamps are suspect.
- Indexing during an external partial write can observe a transient pair. The
  temporary database and atomic swap protect the prior live index on failure;
  rerun after Unity or source-control synchronization finishes.
- Extra parsing after importer-only changes is accepted in favor of freshness.
- Recovery is a one-commit revert; schema 3 remains readable because storage
  shape and public contracts do not change.

## Progress

- [ ] Task 1 implemented with red/green evidence.
- [ ] Focused and repository verification completed.
- [ ] Plan moved to `docs/plans/completed/` after proof.

## Decisions

- 2026-07-22: Keep one logical asset row and use the newer asset/`.meta` mtime.
- 2026-07-22: Preserve schema 3; defer moves, GUID reconciliation, hashes, and watchers.
- 2026-07-22: Target `0.3.1` because this plan is a backward-compatible
  correctness fix with no new public tools or schema changes.

## Validation

- Focused proof: scanner and incremental-index tests demonstrate `.meta`-only invalidation without duplicate nodes.
- Repository-required checks: `npm test`, `npm run typecheck`, `npm run build`, and `git diff --check`.

## Result

Complete after implementation, documentation, review, and validation.
