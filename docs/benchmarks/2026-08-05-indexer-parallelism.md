# Indexer Parallelism Benchmark Report

Date: 2026-08-05

## Purpose

Capture the current Node.js indexer baseline and compare it with bounded
parallel filesystem scanning and YAML reference extraction. This report is the
benchmark record for
[`2026-08-05-indexer-parallelism-benchmark.md`](../plans/active/2026-08-05-indexer-parallelism-benchmark.md).

## Current Pipeline

The current implementation is serial in the two main work-heavy phases:

- `scanProject` discovers project and package roots, then recursively walks
  them.
- `walk` processes directory entries one at a time.
- `buildNode` reads `.meta` content and stats the asset and metadata file.
- `extractAll` reads and parses each YAML asset one at a time.
- `GraphStore` batches node and edge writes in SQLite transactions.
- Incremental indexing still scans the complete filesystem, but only
  re-extracts changed or dependency-affected assets.

Relevant implementation points:

- `src/indexer/index-project.ts:54` - index orchestration and atomic database
  replacement.
- `src/indexer/meta-scanner.ts:57` - scan root discovery and traversal entry.
- `src/indexer/meta-scanner.ts:78` - recursive directory walk.
- `src/indexer/meta-scanner.ts:129` - metadata and asset stat collection.
- `src/indexer/index-project.ts:242` - serial YAML/reference extraction loop.
- `src/store/graph-store.ts:98` - transactional node writes.
- `src/store/graph-store.ts:169` - transactional edge writes.

## Approved Change

Use bounded concurrency for independent filesystem and YAML parsing work.
Keep SQLite mutation serialized and merge task results in deterministic path
order. Do not introduce a Rust implementation during this benchmark phase.

## Environment

| Field | Value |
| --- | --- |
| Branch | `work/indexer-parallelism` |
| Base | `work/release-0.3.3` at `92cfa02` |
| Worktree | `E:\common-workspace\uasset-reference-memory-mcp\.worktrees\indexer-parallelism` |
| OS | To record |
| Node | To record |
| CPU | To record |
| Storage | To record |
| Unity running | To record |
| Fixture project | To record |

## Measurement Contract

Run one warm-up followed by at least three measured runs for each scenario.
Record median and min/max values. Keep cold and warm filesystem-cache runs
separate when they can be controlled.

| Scenario | Scan | Reconcile | Extract | SQLite | Total | Nodes | Edges | Unresolved | Peak memory |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Fresh, baseline serial | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| Incremental, no changes, baseline serial | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| Incremental, controlled change, baseline serial | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| Fresh, bounded parallel | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| Incremental, no changes, bounded parallel | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |
| Incremental, controlled change, bounded parallel | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD | TBD |

## Correctness Checks

For every baseline/parallel pair, compare:

- Node identity, path, type, origin, package, size, and modification time.
- Edge source, target, kind, file ID, context, and count.
- Unresolved references.
- Addressable groups.
- Warning kind, path, and message.
- Index summary counts.

The parallel implementation is acceptable only when output parity passes, the
existing test suite remains green, and the measured benefit is reported rather
than assumed.

## Results

No timings have been recorded yet. This section will be updated after phase
instrumentation and the first baseline run.

## Validation Commands

```text
npm run typecheck
npm test
npm run build
git diff --check
```
