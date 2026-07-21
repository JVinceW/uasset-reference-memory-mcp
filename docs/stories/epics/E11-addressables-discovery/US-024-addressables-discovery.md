# US-024 Addressables discovery

## Status

in_progress

## Lane

normal (E11, approved feature design)

## Product Contract

Normalize Addressables group, entry, and label authoring metadata in schema 3;
expose read-only lookup, filtered discovery, and group inventory through MCP;
preserve the normalized metadata in deterministic JSON exports; and retain
conservative unused-asset behavior. See `docs/product/addressables.md` and
decision 0010.

## Acceptance Criteria

- Parse group identity, group asset identity/path, group name, entries,
  addresses, read-only flags, and per-entry labels while preserving empty groups
  and rejecting non-group YAML cleanly.
- Persist normalized groups, entries, and labels; full and incremental indexing
  replace authoritative membership and remove deleted/removed rows.
- Resolve lookup by GUID, path, exact name, then exact address; report bounded
  ambiguity, known non-Addressable assets, and missing inputs distinctly.
- Search by text, group, label, path prefix, type, and Addressables-only
  reachability with deterministic bounded results, totals, and truncation.
- List every group with entry count, distinct labels, and indexed source bytes;
  source bytes are not bundle bytes.
- Keep Addressable entries and their dependency closure protected in
  `find_unused_assets`; treat `reachableOnlyBecauseAddressable` only as a review
  signal, never deletion safety.
- Register `get_addressable_info`, `search_addressables`, and
  `list_addressable_groups` with the documented success/error contracts.
- Export entry state, owning group identity, and labels deterministically in
  schema 3 JSON and snapshot metadata.
- Preserve normal graph behavior for projects without Addressables and document
  dynamic string-load limitations.
- Keep Stage 1 read-only and defer bundle/configuration settings to Stage 2.

## Validation

| Layer | Expected proof |
| --- | --- |
| Parser | Group/entry identity, labels, read-only entries, empty/non-group/malformed files, and removal cases. |
| Store | Schema 3 tables, normalized persistence, replacement, cascades, and old-schema rejection. |
| Query | Lookup precedence/ambiguity, filters, totals/limits/order, group inventory, reachability, and conservative unused behavior. |
| MCP | Three bounded tool schemas plus documented success and error responses. |
| JSON/snapshot | Normalized deterministic Addressables export and schema 3 artifact metadata. |
| Real project | Re-index and representative asset, group, label, reachability, and migration-readiness checks in an Addressables project. |

## Evidence

- Parser, store, query, MCP, JSON, snapshot, typecheck, and build proof are
  implemented in Tasks 1-5.
- Real-project verification is pending Task 6; this story remains
  `in_progress` until that proof passes.
