# US-012 Scanner refinements: non-asset ignore-list + shader-graph/compute types

## Status

implemented

## Lane

normal (change-request, intake #4)

## Product Contract

Cut missing-meta warning noise by ignoring files/dirs Unity itself does not
import, and classify Shader Graph / compute assets as `Shader` instead of `Other`.

## Acceptance Criteria

- Scanner ignores hidden dotfiles/dirs (`.DS_Store`, `.signature.p7s`, `.git`),
  `~`-suffixed entries (Unity-ignored `Samples~`/`Documentation~`), `*.tmp`,
  `cvs`, and package-manager files (`manifest.json`, `packages-lock.json`) —
  no node, no warning, no recursion.
- `.shadergraph`, `.shadersubgraph`, `.compute` classify as `Shader`.

## Design Notes

- `src/indexer/asset-type.ts` — extension map additions
- `src/indexer/meta-scanner.ts` — `isIgnoredEntry` gate at the top of the walk

## Validation

`scripts/bin/harness-cli story update --id US-012 --unit 1 --integration 1 --e2e 1 --platform 0`

| Layer | Expected proof |
| --- | --- |
| Unit | shadergraph/subgraph/compute → Shader; ignored files neither warned nor noded |
| E2E | Re-index of `pudgy-unity` |

## Evidence

- `npm test` — 132 tests pass.
- **Re-index of `pudgy-unity`**: warnings 3039 → **118**; `Shader` 196 → 368;
  unresolved 8119 → 7023; distinct broken guids 583 → 448.
- **Project content unaffected**: `origin='project'` assets stayed at 5,722; the
  ~2,398 removed were package `Samples~` content Unity does not import
  (`~`-suffixed dirs are hidden from the AssetDatabase). Net effect moves the
  graph closer to Unity's own dependency view.

### Follow-up

- Addressables-as-roots (separate backlog): treat Addressable group entries as
  roots so `find_unused_assets` stops over-reporting. Requires parsing
  `AddressableAssetGroup` `m_GUID` string entries (not `{fileID,guid}` refs).
