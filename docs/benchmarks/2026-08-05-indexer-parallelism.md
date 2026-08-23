# Indexer Parallelism Benchmark Report

Date: 2026-08-05

## Purpose

Capture the current Node.js indexer baseline and compare it with bounded
parallel filesystem scanning and YAML reference extraction. This report is the
benchmark record for
[`2026-08-05-indexer-parallelism-benchmark.md`](../plans/completed/2026-08-05-indexer-parallelism-benchmark.md).

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

### Initial `slot-4` Attempts

The real project could not produce a valid baseline on 2026-08-05:

- Fresh indexing reached duplicate GUID validation and stopped because
  `c64ae6b481a74edf981d6f90c26b69c7` is used by both
  `Assets/Game.Cricket.Lobby/Runtime/Scripts/UI/Common/Toast` and
  `Packages/com.ygg.game.visualization/Runtime/UI/Scripts/Notification`.
- A controlled fresh run that filtered `Packages/com.ygg.game.visualization`
  then stopped while inserting Addressables because
  `addressable_entries.guid` was duplicated.
- A warm incremental run against a copy of the existing index, filtering the
  two duplicate asset paths, stopped on the same Addressables uniqueness
  constraint while replacing affected groups.

The failed attempts took approximately 312 seconds for the first fresh run,
64 seconds for the filtered fresh run, and 13 seconds for the filtered warm
incremental run. These are failure durations, not usable indexing timings, and
must not be used for performance comparisons.

The project database was never used as the output path. Temporary benchmark
copies were created under:

`C:\Users\vince\AppData\Local\Temp\uasset-reference-mcp-indexer-bench`

Valid baseline timings will be recorded after the fixture benchmark is added or
the duplicate project data is resolved.

### Controlled Fixture Pass

The repository benchmark script generated 2,000 Unity-shaped YAML prefab
assets, each with a `.meta`, and 1,998 valid reference edges. It ran three
measured passes at each concurrency level after the fixture was created. The
first pass included a colder filesystem cache; the table reports medians across
all three passes.

| Concurrency | Scan median | Apply median | Extract median | Write median | Total median | Nodes | Edges | Unresolved |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 829.0 ms | 250.8 ms | 235.2 ms | 15.8 ms | 1109.1 ms | 2002 | 1998 | 0 |
| 4 | 122.7 ms | 81.3 ms | 65.4 ms | 15.9 ms | 221.8 ms | 2002 | 1998 | 0 |
| 8 | 76.1 ms | 65.2 ms | 49.9 ms | 15.4 ms | 158.2 ms | 2002 | 1998 | 0 |

The controlled fixture shows approximately 5x lower total time at concurrency
4 and 7x lower total time at concurrency 8 versus concurrency 1. This is a
fixture result, not a prediction for `slot-4`. SQLite write time remains nearly
flat, supporting the decision to keep database writes serialized.

Command:

`npm run benchmark:indexer`

## Validation Commands

```text
npm run typecheck
npm test
npm run build
git diff --check
```
