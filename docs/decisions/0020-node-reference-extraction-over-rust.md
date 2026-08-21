# 0020 Node Reference Extraction Over Rust

Date: 2026-08-21

## Status

Accepted

## Context

Reference extraction parses Unity YAML to find GUID references and is the most
compute-heavy step in indexing, so it was the natural candidate for a native
rewrite. A proof of concept in `rust/uasset-ref-extractor` on
`work/indexer-parallelism` mirrors the Node extractor's output exactly and runs
its parse with Rayon. It is invoked as a subprocess over NDJSON by
`scripts/benchmark-rust-extractor.mjs`, never by product code.

Benchmarked against the same 2,000 prefab records, with every mode producing
2,000 outputs, 1,998 edges, zero unresolved references, and exact output parity
(`docs/benchmarks/2026-08-05-indexer-parallelism.md`):

| Mode | End-to-end median | Extractor-only median |
| --- | ---: | ---: |
| Node, 8 workers | 3.146 ms | 3.146 ms |
| Rust, 8 threads | 119.852 ms | 1.074 ms |

Rust's parse is roughly 2.9x faster. Delivering it through a new subprocess is
roughly 38x slower, because process startup and NDJSON serialization cost about
118 ms that the in-process Node path never pays.

An in-process binding would remove that overhead, so the deciding question is
how much total indexing time the parse actually represents. Measured on this
repository's fixture benchmark at concurrency 8, total indexing is about 110 ms,
of which the extraction phase is about 40 ms — and that phase is dominated by
reading files, since the isolated benchmark puts the parse itself at about 3 ms.
Removing the parse entirely would therefore save under 3% of indexing time.

## Decision

Keep reference extraction in TypeScript (`src/indexer/ref-extractor.ts`). Do not
ship Rust, require a Rust toolchain, or add a native extraction addon.

The Rust proof of concept stays on `work/indexer-parallelism` as recorded
evidence. It is not merged, not built by `npm run build`, and not referenced by
any product code path, so an end user's machine never needs Rust or cargo.

Indexing throughput is pursued through bounded concurrency in Node instead,
which is measured at about 2.7x total speedup on the same fixture at concurrency
8 with identical output.

Revisiting requires two conditions, in order:

1. A valid phase breakdown from a real Unity project, not the synthetic fixture,
   showing parsing is a materially larger share than the fixture's ~3%. No such
   baseline exists yet; the attempts recorded in the benchmark stopped on
   duplicate GUID validation before producing usable timings.
2. An in-process binding, not a subprocess. The 118 ms subprocess overhead is
   structural and cannot be tuned away.

If both hold, native extraction must ship as prebuilt per-platform binaries
selected at install time, consistent with
[0005](0005-prebuilt-rust-harness-cli.md), never as a source build that requires
a toolchain on a user's machine.

## Alternatives Considered

1. Merge the subprocess extractor as an opt-in flag. Rejected because it is
   slower end-to-end at every measured size, so the flag would have no setting
   worth choosing.
2. Build a napi-rs addon now. Rejected because the fixture bounds the payoff
   below 3% while the cost is a cross-compilation matrix, per-platform published
   packages, and two parser implementations that must stay byte-identical
   forever.
3. Delete the Rust proof of concept. Rejected because the measurements are the
   reason this decision is defensible, and the crate is what makes them
   reproducible.

## Consequences

Positive:

- Installs stay pure JavaScript plus the single prebuilt `better_sqlite3` native
  module, so no user needs a Rust or C++ toolchain.
- One extraction implementation to maintain, keeping output parity trivially.
- Release artifacts stay platform-independent; no build matrix is required.

Tradeoffs:

- The parse remains slower than achievable, which matters only if a real project
  shows parsing dominating.
- The proof of concept lives on an unmerged branch, so it will drift from the
  Node extractor and need revalidation before any future comparison.

## Follow-Up

- Capture a real-project phase breakdown once the duplicate GUID validation
  blocker recorded in the benchmark is resolved.
