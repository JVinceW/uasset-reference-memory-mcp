# 0014 Same-Path GUID Replacement

Date: 2026-07-22

## Status

Accepted

## Context

An incremental scan can find the same project-relative path paired with a GUID
different from the one stored previously. This can happen when a `.meta` file
is deleted and regenerated, when a different asset/`.meta` pair replaces the
old pair, or through a source-control update.

Under the GUID-first identity rule, the previous and current GUIDs represent
different logical Unity assets. Treating the current occupant as an in-place
update would conceal the removal of the old identity and could leave incoming
references incorrectly appearing resolved.

## Decision

When a previous path contained GUID A, the current scan contains GUID B at that
path, GUID A is absent from the complete current scan, and GUID B was absent
from the previous index, classify the event as one removal and one addition:

```text
added: 1
updated: 0
removed: 1
```

Indexing completes successfully and emits a `guid-replaced` warning naming the
path, previous GUID, and current GUID. This extends the values carried by the
existing warning collection without adding a response field, database column,
tool, or argument.

Removal processing for GUID A demotes its incoming edges to unresolved
references and removes its outgoing references, node row, and Addressables
ownership. Addition processing creates GUID B, promotes unresolved references
already targeting B, and extracts B's outgoing references and Addressables
metadata.

Classification uses the complete previous and current GUID maps before drawing
a replacement conclusion:

- if GUID A still exists at another path, A moved and B was added;
- if GUID B existed previously at another path, B moved and A was removed; and
- only a globally absent A plus globally new B is a direct replacement.

## Alternatives Considered

1. Classify the path as one updated asset. Rejected because it conflates two
   Unity identities and hides references broken by removal of the old GUID.
2. Fail the index and preserve the previous database. Rejected because GUID
   replacement can be intentional, and a force rebuild would produce the same
   current graph while the preserved database would remain stale.
3. Classify removal and addition without a warning. Rejected because accidental
   `.meta` regeneration is important project-hygiene information that aggregate
   counts alone cannot explain.

## Consequences

Positive:

- Graph identity remains consistent with Unity GUID semantics.
- References to the removed GUID become visibly unresolved.
- Intentional replacement does not block indexing.
- Accidental `.meta` regeneration is diagnosable from the normal index result.

Tradeoffs:

- Consumers must tolerate the new `guid-replaced` warning kind.
- Replacement contributes to both added and removed summary counts.
- Correct classification depends on global GUID reconciliation rather than a
  path-local comparison.

## Follow-Up

- Duplicate current GUID handling is resolved by decision 0015.
- Include replacement ordering, warning proof, and compound move/add/remove
  cases in the combined `0.3.1` implementation plan.
