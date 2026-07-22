# Same-Path GUID Replacement Design

Date: 2026-07-22

## Goal

Reconcile a path whose Unity identity changed without conflating the old and
new GUIDs or leaving the previous index live unnecessarily.

## Identity Rule

GUID remains stable logical identity and path remains mutable location. Given:

```text
previous: Assets/Sword.prefab -> GUID A
current:  Assets/Sword.prefab -> GUID B
```

the scanner observes two different assets. If A is absent from the complete
current GUID set and B is absent from the complete previous GUID set, the event
is a direct identity replacement at one path.

## Approved Behavior

A direct identity replacement completes indexing and produces:

```text
added: 1
updated: 0
removed: 1
warning.kind: guid-replaced
```

The warning uses the occupied path and states both the previous and current
GUIDs in its message. The existing warning array shape remains unchanged.

## Reconciliation Data Flow

1. Build previous and current lookup maps by both path and GUID.
2. Classify stable GUIDs first, including moves and timestamp updates.
3. Identify GUIDs absent from the opposite complete GUID set.
4. When a removed GUID's old path equals an added GUID's current path, emit one
   `guid-replaced` warning for that path.
5. Process the old GUID as a normal removal: demote incoming edges, delete
   outgoing data, remove Addressables ownership, and delete the node.
6. Process the new GUID as a normal addition: upsert the node, promote existing
   unresolved references targeting it, and extract its outgoing and
   Addressables data.

The warning describes the relationship between an otherwise ordinary removal
and addition; it does not introduce a third stored asset state.

## Compound Cases

Global GUID presence takes priority over path occupancy:

- If A is found at a new path, classify A as moved and B as added.
- If B came from another path, classify B as moved and A as removed.
- If both occur through a path swap, reconcile each stable GUID as a move.
- Duplicate occurrences of either GUID make the identity mapping ambiguous and
  are handled by the separate duplicate-GUID policy.

These rules prevent the same GUID from being included in both update and
removal processing.

## Failure Behavior

Replacement itself is not an indexing failure. Normal temporary-database and
atomic-swap behavior still protects the live database from actual scan,
extraction, or storage failures. A force rebuild is not required because it
would observe the same replacement.

## Validation Contract

- A globally removed A and globally new B at the same path reports one add,
  zero updates, one removal, and one `guid-replaced` warning containing A and B.
- Incoming edges targeting A become unresolved.
- B's outgoing references and Addressables metadata are freshly indexed.
- A moved elsewhere plus B added at A's former path reports one move/update and
  one addition without removing A.
- B moved into A's former path while A disappears reports one move/update and
  one removal without adding B.
- Swapping the paths of two existing GUIDs reports two updates and no additions
  or removals.
- Existing add, update, removal, move, rename, and meta-aware freshness tests
  remain green.

## Compatibility And Scope

The change adds a `guid-replaced` value to `ScanWarningKind` but preserves the
warning object, index summary, MCP/CLI arguments, database schema 3, and tool
response shapes. It is a backward-compatible reindex correctness fix targeted
for `0.3.1`.

This design does not resolve duplicate current GUIDs, timestamp-preserving
content changes, automatic agent reindex policy, filesystem watchers, or Unity
editor event journaling.
