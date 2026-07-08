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
  },
  "scan": {
    "ignore": ["**/StompyRobot/**", "*.bak"],
    "ignoreDefaults": true
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

### `scan.ignore` — `string[]` (default `[]`) and `scan.ignoreDefaults` — `bool` (default `true`)

Control which files/folders the indexer skips (no node, no warning, no recursion).

- `scan.ignore` — your glob patterns, **added** to the built-in rules. Each
  pattern is matched against the entry's **base name** and its **project-relative
  path**, so all of these work: `*.bak`, `Thumbs.db`, `**/Temp`,
  `Assets/ThirdParty/**`. Globs: `*` = any run except `/`; `**` = any run
  including `/`.
- `scan.ignoreDefaults` — keep the built-in Unity rules (hidden dotfiles,
  `~`-suffixed dirs like `Samples~`, `*.tmp`, `cvs`, `manifest.json`,
  `packages-lock.json`). Set `false` to disable them and use **only** your
  patterns.

Unlike `addressableRoots`, the ignore-list is applied at **index time** — it
changes which assets exist, so editing it requires re-indexing (`--force`).

## Not yet counted as roots

Even with `addressableRoots` on, **code-based** loads (`Resources.Load("path")`
by string, hard-coded Addressable address strings in C#) are not tracked — that
needs code scanning (deferred `CODE_REF`). Treat `find_unused` output as strong
candidates, verified against your loading code.
