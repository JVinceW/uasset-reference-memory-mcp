# US-002 Reference extraction → edges + unresolved refs

## Status

planned

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

Add after implementation.
