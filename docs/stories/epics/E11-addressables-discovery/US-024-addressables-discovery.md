# US-024 Addressables discovery

## Status

implemented

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

- Repository verification on 2026-07-22: `npm test` passed 37 files and 222
  tests; `npm run typecheck`, `npm run build`, and `git diff --check` exited 0.
- `npm pack --dry-run` exited 0 with 119 files (550.0 kB packed, 1.4 MB
  unpacked), including `dist/mcp/server.js`, `dist/mcp/tools.js`,
  `dist/query/addressables.js`, `README.md`, and `package.json`.
- Authorized external repository: `E:\Unity\go-royal-client`. Its Unity
  project root is `E:\Unity\go-royal-client\go-royal-unity` because the
  authorized monorepo root has no `Assets` directory. The built CLI command
  `node dist/cli/main.js index "E:\Unity\go-royal-client\go-royal-unity" --force`
  rebuilt `.asset-memory/index.db` as schema 3 with 15,776 assets, 995 edges,
  97 unresolved references, and 119 warnings.
- Live `get_addressable_info` by project path found
  `Assets/Game.Contents/Resources/RoomFlow/Ugui/Scene04MatchStartWaiting.prefab`
  (GUID `326a6e4058a64e244acd48c5fa14aecc`) as a non-Addressable Prefab with 0
  incoming and 120 outgoing references. It returned `isAddressable: false`,
  `addressable: null`, and `reachableOnlyBecauseAddressable: false`.
- The same live index contains 0 Addressable groups and 0 entries. Therefore a
  positive lookup by runtime address was unavailable; the representative input
  `room-flow/match-start-waiting` returned `not-found`. A group `UI` plus label
  `remote` search returned 0 entries, the reachable-only search returned 0
  entries, and `list_addressable_groups` returned 0 groups and consequently 0
  direct indexed source bytes. This absence agrees with no
  `m_SerializeEntries:` group YAML and no `com.unity.addressables` package or
  `AddressableAssetSettings` reference in the authorized Unity project.
- Live `find_unused_assets` returned the same 184 assets and 40,840,010 bytes
  with `addressableRoots: auto` and `addressableRoots: off`, as expected when
  the project has no Addressable roots. Positive address, label, group-byte,
  and Addressables-only reachability cases remain covered by the repository's
  automated query and MCP fixtures rather than invented real-project samples.
- Scope review used `git diff --stat HEAD~5..HEAD`, the required unsafe-claim
  search, and `git status --short`. The only phrase matches explicitly say the
  review signal is not evidence that an asset is unused or safe to delete.
