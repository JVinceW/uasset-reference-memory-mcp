# Verification Contract

Verification cross-checks the static parser's graph against Unity's
authoritative dependency data. It is manually triggered and not required for
the index to function. It is the accuracy meter and regression harness.

## Unity-side Exporter

A standalone UPM Editor package, `com.jvincew.assetreferencememory`, provides a
menu item and invokable method. It uses
`AssetDatabase.GetDependencies(path, recursive: false)` over every imported
asset and writes `<project>/.asset-memory/verify.json`.

```json
{
  "schemaVersion": 1,
  "unityVersion": "2022.3.x",
  "exportedAt": "<iso8601>",
  "assets": [
    {
      "path": "Assets/Prefabs/Player.prefab",
      "guid": "8f2a1c...",
      "dependencies": [
        { "path": "Assets/Materials/body.mat", "guid": "..." }
      ]
    }
  ]
}
```

Constraints:

- Editor-only; never ships in a player build.
- Non-recursive dependencies per asset; the graph handles transitivity.
- Runs only when the user invokes it. There is no automation or file watcher.
- Each dependency carries its GUID. The verifier resolves GUID identity first
  and path only as a fallback, allowing Unity's virtual `Packages/` paths to
  compare with indexed `Library/PackageCache/` paths.
- The exporter sorts output, skips folders and package manifests, and cancels
  without replacing a previous export.

Install through Unity Package Manager from the repository subfolder:

```text
https://github.com/JVinceW/uasset-reference-memory-mcp.git?path=/unity/com.jvincew.assetreferencememory#<release-tag>
```

## `verify_index(verifyJsonPath)`

The verifier compares unique `from GUID -> to GUID` dependency pairs, not
individual parser reference-site rows. This matches Unity's path-level
dependency API while preserving parser `ref_kind` details for grouped results.

It reports:

- Missed edges: dependencies Unity reports that the static parser did not
  capture. This is the primary parser-improvement signal.
- Extra edges: graph dependencies Unity did not report, often caused by builtins
  or Unity dependency pruning.
- Category counts grouped by source asset type, source origin, and `ref_kind`.
- Export mismatches: source assets or dependencies absent from the current
  index, plus project-asset GUID/path mismatches.

Every completed run atomically replaces
`<project>/.asset-memory/verify-report.json` with the full diff. CLI and MCP
return only a bounded summary: totals, all category counts, ten missed and ten
extra samples, and `reportPath`.

A diff is a successful verification. Bad input, a missing index, or an
unwritable report is an error. `index_meta.verify_last_run` and
`index_meta.verify_last_report` update only after the report file is written.

## How It Fits The Goals

After running verification against real Unity projects, each missed-edge
category becomes a concrete parser-improvement story. The full report is also
the ground-truth regression artifact as the parser evolves.
