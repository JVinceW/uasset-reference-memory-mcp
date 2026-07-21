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

- Repository verification on 2026-07-22: `npm test` passed 37 files and 224
  tests; `npm run typecheck`, `npm run build`, and `git diff --check` exited 0.
- `npm pack --dry-run` exited 0 with 119 files (550.0 kB packed, 1.4 MB
  unpacked), including `dist/mcp/server.js`, `dist/mcp/tools.js`,
  `dist/query/addressables.js`, `README.md`, and `package.json`.
- Authorized Addressables-heavy project: `E:\Unity\cricket-city-unity`. Before
  indexing, its generated `.asset-memory/index.db` was 12,726,272 bytes with a
  2026-07-21 14:29:11 +09:00 timestamp. The built CLI command
  `node dist/cli/main.js index "E:\Unity\cricket-city-unity" --force` rebuilt
  it as schema 3 with 20,834 assets, 8,773 edges, 7,046 unresolved references,
  and 95 warnings.
- The first real-project rebuild exposed three package-cache `.unity` expected
  fixtures reusing one test group GUID and live `m_SerializedLabels` fields.
  Two red-first parser regressions now restrict live groups to `.asset` sources
  and accept both label field spellings; focused parser/indexer tests passed
  15/15 before the successful rebuild.
- `get_addressable_info` resolved
  `Assets/Game.Cricket.MainGame/Contents/MasterData/DT_CardDataTable.asset` and
  runtime address `DT_CardDataTable` to the same GUID
  `0a5e0603d17b64e51ba8ccfc32dc54b6` in group
  `cricket-city.master-data`, with 0 incoming / 1 outgoing reference and
  `reachableOnlyBecauseAddressable: true`.
- The same tool found
  `Assets/AddressableAssetsData/AddressableAssetSettings.asset` as a known
  non-Addressable ScriptableObject with `addressable: null`, 19 incoming / 23
  outgoing references, and `reachableOnlyBecauseAddressable: false`.
- `search_addressables` with group `Default Local Group` and label `bgm`
  returned 6 AudioClip entries, not truncated; the first was
  `Assets/lobby.contents/sounds/bgm/BGM_feature_blockgame.ogg`.
- `list_addressable_groups` returned 18 deterministic groups and 421,964,942
  aggregate direct indexed source bytes. Samples include `cricket-city.main-game`
  (5 entries / 271,041 bytes), `Default Local Group` (46 entries / 9,757,507
  bytes / labels `bgm`, `sfx`), and empty `ui.theme.xmas` (0 / 0).
- The reachable-only filter returned total 2,707 (truncated at the requested
  limit 5), including `DT_CardDataTable` and
  `DA_PenguMapProfileDataAsset.asset`.
- `find_unused_assets` returned 562 assets / 64,679,613 bytes with
  `addressableRoots: auto` and 3,259 assets / 496,360,208 bytes with `off`—a
  conservative-root delta of 2,697 assets / 431,680,595 bytes.
- After verification, external status changed only the authorized generated
  `.asset-memory/index.db` (13,348,864 bytes, SHA-256
  `1CEB40B4637110CFE88728D2A9C2B375B6AB0C5C1A9D34684D67583D38B0E493`);
  no Unity asset, source, package, or project-setting file changed. The dirty
  `YGG_Package` submodule state was present in the baseline and was untouched.
- Scope review used `git diff --stat HEAD~5..HEAD`, the required unsafe-claim
  search, and `git status --short`. The only phrase matches explicitly say the
  review signal is not evidence that an asset is unused or safe to delete.
