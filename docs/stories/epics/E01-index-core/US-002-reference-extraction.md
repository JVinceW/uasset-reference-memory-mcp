# US-002 Reference extraction → edges + unresolved refs

## Status

implemented

## Lane

normal

## Product Contract

Given the GUID map from US-001, scan each text-serialized asset for `guid:`
references and emit one edge per (from_guid, to_guid, ref_kind, context),
capturing `fileID` and the YAML property name. References to GUIDs not in the map
become `unresolved_refs`. This is the `ref-extractor` component.

## Relevant Product Docs

- `docs/product/indexing.md`
- `docs/product/asset-graph-model.md` (`edges`, `unresolved_refs`)

## Acceptance Criteria

- Every `{fileID, guid, type}` reference in a text asset produces an edge to the
  referenced GUID.
- `ref_kind` is typed by target `asset_type` / property context (`USES_SCRIPT`,
  `USES_MATERIAL`, `USES_TEXTURE`, `USES_SHADER`, `USES_MESH`, `USES_ANIMATION`,
  `NESTED_PREFAB`, else `SERIALIZED_REF`).
- `context` captures the YAML property name (e.g. `m_Script`, `m_Materials`,
  `_MainTex`) on a best-effort basis.
- Duplicate identical references collapse into one row with `count` incremented.
- A GUID with no matching node is written to `unresolved_refs`, never dropped and
  never an error.
- Binary assets (`is_binary=1`) are skipped for outgoing extraction.
- Unparseable YAML records the node but adds a warning and skips its edges.

## Design Notes

- Commands: `extract(asset, guidMap) -> {edges, unresolved}`
- Queries: none yet
- API: consumes GUID map (US-001), feeds store (US-003)
- Tables: `edges`, `unresolved_refs`
- Domain rules: GUID uniqueness makes references unambiguous; no type resolution
- UI surfaces: none

## Validation

`scripts/bin/harness-cli story update --id US-002 --unit 1 --integration 1 --e2e 0 --platform 0`

| Layer | Expected proof |
| --- | --- |
| Unit | Fixture snippets per `ref_kind`; unresolved-ref case; malformed-YAML case; duplicate collapse |
| Integration | Fixture project → expected edge count/kinds + one deliberate broken ref |
| E2E | n/a |
| Platform | n/a |
| Release | Part of full suite |

## Harness Delta

None expected.

## Evidence

- `npm test` — 76 tests pass (10 files). New: `ref-extractor` (typed ref_kind,
  array/`m_Script` context, unresolved routing, dup-count collapse, self/zero-guid
  skip, binary-header detection), `graph-store-edges` (deleteOutgoing,
  demote/promote), `index-project-edges` (fresh edges+unresolved, binary loud
  failure, incremental demote-on-remove and promote-on-add).
- `npm run typecheck` clean; `npm run build` ok.
- **End-to-end** on the fixture via the built CLI: `edges: 3, unresolved: 1`.
  Bare `sqlite3` join showed the chain
  `Player.prefab →(USES_MATERIAL) body.mat →(USES_TEXTURE) skin.png` and
  `Player.prefab →(USES_SCRIPT) Player.cs`; the missing shader guid landed in
  `unresolved_refs` with context `m_Shader`.

### Notes / boundaries

- `ref_kind` typed by target `asset_type`; `context` is best-effort YAML key
  (same-line key, else nearest array key).
- Binary serialization (missing `%YAML` header) throws `BinarySerializationError`
  with Force-Text guidance; the atomic build leaves any prior index intact.
- Incremental keeps cross-file consistency: deleting a target demotes inbound
  edges to unresolved; adding a target promotes matching unresolved to edges.
  `--force` remains the fully-consistent rebuild.
- References to Unity **builtin** assets and package ids stay unresolved until
  **US-004** seeds builtins / parses `package_id`.

### Correction (intake #2, real-project verification)

Real project `pudgy-unity` surfaced that always-binary `.asset` files
(`LightingData.asset`, NavMesh, etc.) exist even in Force-Text projects. The
original per-file "fail loudly on missing `%YAML`" aborted the whole index.
Fixed: `indexProject` now reads `ProjectSettings/EditorSettings.asset`
`m_SerializationMode` — fails loudly only when the **project** is ForceBinary(1);
incidental binary assets are skipped with a `binary-serialized` warning and the
index completes. New module `project-settings.ts` (`parseSerializationMode`).
Verified end-to-end: 22,913 assets / 12,956 edges / 8,119 (genuine) unresolved
in 7.4s.
