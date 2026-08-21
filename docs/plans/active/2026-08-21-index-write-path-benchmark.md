# Execution Plan: Index Performance Profile And Write Path Benchmark

Date: 2026-08-21

## Status

Active

## Outcome

A repeatable write-path benchmark exists at `scripts/benchmark-write-path.mjs`,
and the first real-project performance profile for this indexer has been
captured. The profile relocates the bottleneck: scanning dominates, the write
path is minor, and reference parsing is too small to justify native code. Two
candidate changes are measured and ready to implement; neither has been applied
to product code yet.

## Context

`docs/benchmarks/2026-08-05-indexer-parallelism.md` established parallel
indexing but never obtained a valid real-project baseline — every attempt
stopped on duplicate GUID validation. Its fixture generates 100-byte assets
carrying a single reference each, which measures per-file overhead rather than
parse or write throughput.

[0020](../../decisions/0020-node-reference-extraction-over-rust.md) shelved the
Rust extractor and set a real-project phase breakdown as the first gate for
revisiting that decision. This plan closes that gap.

Measurements were taken against a real Unity project of 32,579 indexed assets
and 28,842 edges (`cricket-city-implementation`), on macOS with 8 logical CPUs.
The project's own `.asset-memory/index.db` was never written to; every run used
a scratch database.

## Scope

In scope:

- A write-path benchmark with variance control.
- A real-project phase profile.
- Measuring candidate write-path and concurrency changes.

Out of scope:

- Applying any change to product code. Each candidate below is a separate
  bounded change with its own validation.
- Native or Rust extraction, which 0020 governs.

## Benchmark Baseline

Real project, concurrency 8, medians over four runs (total spread ~4%):

| Phase | Median | Share |
| --- | ---: | ---: |
| scan | 2963-3082 ms | ~60% |
| extract (read + parse) | 1631-1733 ms | ~33% |
| write | 267-338 ms | ~6% |
| total | 4964-5164 ms | |

Reference parsing alone, measured over the project's 1,827 YAML assets
(128.8 MB): 485 ms serial, about 266 MB/s.

## Approach

Both benchmarks run variants interleaved across rounds rather than grouped, so
thermal drift and background load affect every variant equally, and both discard
a warm-up round. Results are reported as median with min, max, and coefficient
of variation, so a difference can be compared against its own noise floor.

The write-path benchmark builds node and edge rows once and reuses them for
every variant, leaving the write configuration as the only difference. It
asserts row-count parity across variants, and exits non-zero on mismatch, so a
faster variant that loses rows cannot be read as a win.

## Risks And Recovery

- The write benchmark's corpus is intentionally denser than the real project
  (~139 edges per asset versus ~0.9) to resolve write differences above noise.
  Its percentages describe the write phase only and must be scaled by that
  phase's ~6% share before any end-to-end claim. This is recorded in the
  script header so a future reader cannot take the numbers at face value.
- Concurrency results above 32 carry 8-9% CV, close to the effect size. Confirm
  on a second machine and a second project before changing a shipped default.
- All timings come from one macOS machine with 8 logical CPUs. A spinning disk,
  a network share, or Windows Defender scanning could reorder the phases
  entirely.

## Progress

- [x] Add `scripts/benchmark-write-path.mjs`.
- [x] Capture the real-project phase profile.
- [x] Measure write-path variants.
- [x] Measure concurrency scaling on the real project.
- [ ] Apply the redundant-index removal as its own change.
- [ ] Decide and apply a concurrency default change.

## Decisions

Write-path variants, 1,500-asset dense corpus, 9 interleaved rounds:

| Variant | Median | vs baseline |
| --- | ---: | ---: |
| baseline (shipped) | 711 ms | — |
| synchronous=NORMAL | 697 ms | 1.02x |
| foreign_keys=OFF | 741 ms | 0.96x |
| drop idx_edges_from | 629 ms | 1.13x |
| defer idx_edges_to | 566 ms | 1.26x |
| edges WITHOUT ROWID | 770 ms | 0.92x |
| drop + defer | 491 ms | 1.45x |
| drop + defer + cache | 511 ms | 1.39x |
| drop + defer + norowid | 542 ms | 1.31x |

1. `idx_edges_from` is redundant and should be removed. `edges` is keyed
   `PRIMARY KEY (from_guid, to_guid, ref_kind, context)`, so `from_guid` is
   already the leftmost column of the primary key index and any `from_guid`
   lookup is served by it. The extra index costs write time and disk for no read
   benefit. This holds independently of the timings.
2. Do not adopt `WITHOUT ROWID` for `edges`. It measured consistently slower
   (0.92x), and remained a loss inside the best combination. The key is four
   wide TEXT columns, so the resulting b-tree rows are large.
3. Do not adopt `synchronous = NORMAL`, `foreign_keys = OFF`, or a larger
   `cache_size`. Each landed within noise; the durability and integrity cost of
   the first two buys nothing measurable.
4. Deferring `idx_edges_to` until after bulk load is a real gain but changes
   incremental-update behavior, so it needs its own design pass rather than
   riding along with the redundant-index removal.

Concurrency on the real project, 5 interleaved rounds, edge count identical
across every run:

| Concurrency | Median total | vs 8 | CV |
| ---: | ---: | ---: | ---: |
| 8 (current default cap) | 4203 ms | 1.00x | 4.3% |
| 16 | 3841 ms | 1.09x | 2.7% |
| 32 | 3558 ms | 1.18x | 8.5% |
| 48 | 3359 ms | 1.25x | 9.3% |

5. `DEFAULT_INDEX_CONCURRENCY` is `Math.min(8, Math.max(2, availableParallelism()))`,
   a CPU-count heuristic applied to a workload that is roughly 93% filesystem
   I/O. Indexing keeps improving well past the core count because workers spend
   their time waiting on syscalls, not computing. Raising the cap is the largest
   measured win available and costs no new code paths.
6. `UV_THREADPOOL_SIZE` is not the lever. Raising it from 4 to 32 moved scan
   about 8% and total about 5%, near the noise floor.

## Validation

- `node scripts/benchmark-write-path.mjs [assets] [rounds]` reports medians with
  CV and fails on row-count mismatch between variants.
- Real-project profile reproduced across four runs at ~4% total spread, and
  concurrency scaling across five interleaved rounds with identical edge counts.
- No product code changed, so the existing suite is unaffected.

## Result

Pending. The profile and the candidate measurements are complete; the two
implementation items under Progress remain open, and this plan stays active
until they are decided and validated.
