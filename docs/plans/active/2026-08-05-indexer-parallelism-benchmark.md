# Execution Plan: Parallel Indexer And Benchmark Baseline

Date: 2026-08-05

## Status

Active

## Outcome

Measure the current serial indexing pipeline, add bounded parallelism to the
filesystem and YAML reference-extraction stages, and verify that the graph
output remains deterministic and behaviorally equivalent.

## Context

This work is based on the approved recommendation from the Web Viewer and
indexer performance discussion:

- The current indexer is TypeScript/Node.js and writes to SQLite through
  `better-sqlite3`.
- `indexProject` coordinates scan, fresh/incremental reconciliation, reference
  extraction, and the final database swap in
  `src/indexer/index-project.ts:54`.
- `scanProject` discovers project/package roots and recursively calls `walk` in
  `src/indexer/meta-scanner.ts:57`.
- `walk` currently processes directory entries sequentially and `buildNode`
  reads metadata and stats assets in `src/indexer/meta-scanner.ts:78` and
  `src/indexer/meta-scanner.ts:129`.
- `extractAll` currently reads and parses YAML assets sequentially in
  `src/indexer/index-project.ts:242`.
- `GraphStore.upsertNodes` and `GraphStore.insertEdges` already batch writes in
  SQLite transactions in `src/store/graph-store.ts:98` and `src/store/graph-store.ts:169`.
- Incremental indexing still performs the complete filesystem scan, then
  re-extracts only added, updated, or dependency-affected assets.

## Scope

In scope:

- Capture reproducible baseline timings for fresh and incremental indexing.
- Add bounded concurrency to safe filesystem and YAML parsing work.
- Preserve the existing Node API, SQLite schema, CLI behavior, and viewer data
  contract.
- Preserve deterministic node, edge, warning, and summary output.
- Add focused tests and benchmark evidence.

Out of scope:

- Rewriting the indexer in Rust during this phase.
- Parallel SQLite writes on the same `GraphStore` connection.
- Changing the web viewer or graph rendering.
- Changing the asset graph schema or reference semantics.

## Benchmark Baseline

The baseline report must record, for each fixture project:

- OS, Node version, CPU, storage type, and whether Unity is running.
- Project root and database path.
- Fresh index elapsed time.
- Incremental index elapsed time with no changes.
- Incremental index elapsed time after a controlled asset change.
- Scan duration and discovered node count.
- Reference extraction duration and edge/unresolved counts.
- SQLite write duration and final node/edge counts.
- Peak memory when it is available from the selected measurement method.

Each scenario should be run at least three times after one warm-up run. Report
median and min/max values. The report must distinguish cold filesystem cache
results from warm results when that distinction can be controlled.

## Approach

1. Add phase timing around scan, reconciliation, extraction, and database
   writes without changing indexing behavior.
2. Establish baseline measurements and record them in this plan.
3. Introduce a bounded worker pool for YAML file reads and reference parsing.
4. Introduce bounded concurrency for independent scan roots and directory
   traversal/metadata work where it does not increase unbounded memory use.
5. Collect task-local warnings and results, then merge them in stable path order.
6. Keep all SQLite mutations on the existing serialized transaction path.
7. Compare output parity against the baseline and existing test fixtures.
8. Tune the default concurrency from measured results and expose it only if a
   user-facing setting is necessary.

## Risks And Recovery

- Too much concurrency can make indexing slower on HDDs or while Unity is
  importing assets. Mitigation: use a bounded default and benchmark several
  levels.
- Parallel completion can reorder warnings or edges. Mitigation: sort or merge
  by stable asset path before writing and reporting.
- Unbounded reads can increase memory usage on large YAML assets. Mitigation:
  use a fixed queue and bounded in-flight bytes where measurement requires it.
- A failed task must not leave a partially published index. Recovery remains the
  existing temporary database cleanup and atomic swap behavior in
  `indexProject`.

## Progress

- [x] Create isolated worktree from `work/release-0.3.3`.
- [x] Record the current serial pipeline and benchmark fields.
- [x] Add baseline phase instrumentation.
- [x] Capture a controlled fixture baseline and record `slot-4` blockers.
- [x] Parallelize YAML extraction with bounded concurrency.
- [x] Parallelize safe filesystem scan work.
- [x] Add parity and concurrency tests.
- [ ] Re-run benchmarks and document the result.
- [ ] Run typecheck, full tests, build, and final worktree review.

## Decisions

- 2026-08-05: Start from `work/release-0.3.3` in a dedicated
  `work/indexer-parallelism` worktree so release preparation remains isolated.
- 2026-08-05: Benchmark and optimize the Node implementation before deciding
  whether a Rust worker is justified.
- 2026-08-05: Keep SQLite writes serialized because the current transaction
  batching is already an explicit performance boundary.
- 2026-08-05: Use bounded concurrency and deterministic result merging rather
  than unbounded `Promise.all`.

## Validation

- Focused proof: benchmark report, output parity checks, concurrency behavior
  tests, and fresh/incremental index fixtures.
- Repository-required checks: `npm run typecheck`, `npm test`, `npm run build`,
  and `git diff --check`.

## Result

Complete after implementation, benchmark comparison, and validation.
