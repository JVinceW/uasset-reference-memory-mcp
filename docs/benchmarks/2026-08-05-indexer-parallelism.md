# Indexer Parallelism Benchmark Report

Date: 2026-08-05

## Purpose

Capture the current Node.js indexer baseline and compare it with bounded
parallel filesystem scanning and YAML reference extraction. It also records an
isolated Rust reference-extraction proof of concept. This report is the
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
order. The Rust comparison is limited to an isolated extractor sidecar; a
production Rust rewrite or integration remains a separate decision.

## Environment

| Field | Value |
| --- | --- |
| Branch | `work/indexer-parallelism` |
| Base | `work/release-0.3.3` at `92cfa02` |
| Worktree | `E:\common-workspace\uasset-reference-memory-mcp\.worktrees\indexer-parallelism` |
| OS | Windows, PowerShell |
| Node | `v24.18.0` |
| Rust | `rustc 1.94.1` |
| CPU | 12th Gen Intel Core i7-12700K |
| Storage | E: NTFS; media type not recorded |
| Unity running | Not applicable to controlled fixture |
| Fixture project | Temporary 2,000-asset Unity-shaped fixture |

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

### Isolated Rust Extractor Pass

The Rust proof of concept in `rust/uasset-ref-extractor` mirrors the current
Node reference-extraction output and was benchmarked against the same 2,000
prefab records. Every mode produced 2,000 outputs, 1,998 edges, zero unresolved
references, and exact output parity with the warm-up result.

The end-to-end column includes starting a new Rust process, reading the target
map, serializing the input to NDJSON, and parsing the NDJSON output. The inner
column is measured around only the Rayon extraction phase inside that process.

| Mode | End-to-end median | Extractor-only median | Min/max end-to-end | Min/max extractor-only |
| --- | ---: | ---: | ---: | ---: |
| Node, 1 worker | 3.879 ms | 3.879 ms | 3.021 / 4.064 ms | 3.021 / 4.064 ms |
| Node, 8 workers | 3.146 ms | 3.146 ms | 2.469 / 3.518 ms | 2.469 / 3.518 ms |
| Rust, 1 thread | 125.470 ms | 2.297 ms | 125.271 / 125.883 ms | 2.264 / 2.358 ms |
| Rust, 8 threads | 119.852 ms | 1.074 ms | 119.277 / 125.147 ms | 0.965 / 1.310 ms |

Conclusion: Rust is faster for the isolated parser computation, but a new
Rust subprocess is substantially slower for this batch because process and
JSON/pipe overhead dominate. Rust should not replace the current Node path as
a subprocess for small incremental batches. A production Rust path would need
an in-process N-API binding or a long-lived worker with a binary/batched
protocol, plus larger real-project measurements before adoption.

Command:

`npm run benchmark:rust-extractor`

## Validation Commands

```text
npm run typecheck
npm test
npm run build
npm run benchmark:rust-extractor
cargo fmt --manifest-path rust/uasset-ref-extractor/Cargo.toml --check
cargo test --manifest-path rust/uasset-ref-extractor/Cargo.toml
git diff --check
```
