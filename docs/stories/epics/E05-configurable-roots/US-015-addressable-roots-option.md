# US-015 find_unused addressableRoots option + overrides (MCP/viewer)

## Status

implemented

## Lane

normal (intake #5)

## Product Contract

`find_unused_assets` gains an `addressableRoots` option (`auto`/`on`/`off`) that
optionally treats Addressable entries (US-013) as roots. Resolution: explicit
per-call value → project config (US-014) → default `auto`. Exposed via the MCP
tool arg and the web `/api/unused` param.

## Relevant Product Docs

- `docs/product/configuration.md`
- `docs/product/mcp-tools.md`

## Acceptance Criteria

- `findUnusedAssets(db, { addressableRoots })`: `on` always, `off` never, `auto`
  iff `addressable_entries` is non-empty; when active, roots include
  `addressable_entries`.
- MCP `find_unused_assets` resolves override → config default; reports the mode
  and an honest note.
- `/api/unused` accepts `addressableRoots`.

## Design Notes

- `src/query/unused.ts` — `useAddressables` + roots UNION
- `src/mcp/tools.ts` — resolve config/override, report mode
- `src/mcp/server.ts` — `addressableRoots` enum arg
- `src/web/api.ts` — pass-through param

## Validation

`scripts/bin/harness-cli story update --id US-015 --unit 1 --integration 0 --e2e 1 --platform 0`

| Layer | Expected proof |
| --- | --- |
| Unit | on/off/auto behavior; auto-with-no-entries unchanged |
| E2E | Real project comparison |

## Evidence

- `npm test` — 144 tests pass.
- **Real project** (`Assets/lobby.contents/`): `off` → 710 unused (~70 MB);
  `auto` → **1**. Confirms the auto default makes `find_unused` trustworthy for
  an Addressables-heavy project (2,916 entries), while `off` gives the raw
  scene-reachability view.

### Follow-up

- Web viewer UI: a find_unused panel with an addressableRoots toggle (the API
  already supports it; the viewer is currently neighborhood-only).
