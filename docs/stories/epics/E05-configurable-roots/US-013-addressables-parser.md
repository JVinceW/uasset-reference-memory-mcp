# US-013 Addressables entry parser + addressable_entries storage

## Status

implemented

## Lane

normal (intake #5)

## Product Contract

Parse `AddressableAssetGroup` assets during indexing and record every Addressable
entry (guid + address) into an `addressable_entries` table, so the query layer
can optionally use them as roots (US-015). Detection is content-based (any asset
containing `m_SerializeEntries:`), so it is path-independent across projects.

## Acceptance Criteria

- `extractAddressableEntries(content)` returns list-item entry guids
  (`- m_GUID:`) with their `m_Address`, and never the group's own top-level
  `m_GUID:`.
- Non-group assets and empty entry lists yield `[]`.
- Indexing reuses already-read YAML content (no extra I/O) and writes entries to
  `addressable_entries (guid PRIMARY KEY, address)`.
- Schema bumped to version 2 (additive table).

## Design Notes

- `src/indexer/addressables.ts` — `extractAddressableEntries`
- `src/store/schema.ts` — `addressable_entries` table, `SCHEMA_VERSION = 2`
- `src/store/graph-store.ts` — `insertAddressableEntries`, `addressableCount`
- `src/indexer/index-project.ts` — parse in `extractAll`, store per fresh/incremental

## Validation

`scripts/bin/harness-cli story update --id US-013 --unit 1 --integration 1 --e2e 1 --platform 0`

| Layer | Expected proof |
| --- | --- |
| Unit | entry vs group-guid; non-group; empty list |
| E2E | Real index of `pudgy-unity` |

## Evidence

- `npm test` — 136 tests pass (incl. `addressables` 4).
- **Real index of `pudgy-unity`**: **2,916** addressable entries captured (audio,
  ScriptableObjects, etc.) — precisely the set that was over-reported as unused.

### Notes / boundaries

- Incremental re-parses changed groups only; a deleted group may leave stale
  entries until `--force`. Full accuracy on rebuild.
- Entries are stored as data regardless of the config toggle; US-015 decides
  whether to apply them as roots.
