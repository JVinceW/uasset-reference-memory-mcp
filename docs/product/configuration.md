# Project Configuration

Per-project options live in `.asset-memory/config.json`, next to the index
(`.asset-memory/index.db`). The file is optional — absent or invalid config falls
back to documented defaults. Options are overridable per call (MCP tool args,
web `/api` params) without editing the file. This is the extension point for
future per-project settings.

## Format

```json
{
  "unused": {
    "addressableRoots": "auto"
  }
}
```

## Options

### `unused.addressableRoots` — `"auto" | "on" | "off"` (default `"auto"`)

Controls whether Addressable entries are treated as **roots** (entry points) in
`find_unused_assets`. Addressables load assets at runtime by address string, so
without this they look unreachable and get falsely flagged as unused.

- `auto` — use Addressable entries as roots **if the project has any** (parsed
  from `AddressableAssetGroup` assets, US-013). No effect on non-Addressables
  projects. **Recommended.**
- `on` — always use them.
- `off` — ignore them (raw Scenes + `Resources/` reachability only).

Precedence: an explicit per-call value (e.g. MCP `find_unused_assets`
`addressableRoots` arg) overrides the config file, which overrides the default.

Measured impact (pudgy-unity, `Assets/lobby.contents/`): `off` → 710 unused
(~70 MB); `auto` → 1. That folder is almost entirely Addressable-loaded, so
`off` over-reports ~710×.

## Not yet counted as roots

Even with `addressableRoots` on, **code-based** loads (`Resources.Load("path")`
by string, hard-coded Addressable address strings in C#) are not tracked — that
needs code scanning (deferred `CODE_REF`). Treat `find_unused` output as strong
candidates, verified against your loading code.
