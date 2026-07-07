# Verification Contract

Verification cross-checks the static parser's graph against Unity's own
authoritative dependency data. It is **manually triggered** and **not required**
for the index to function — it is the accuracy meter and regression harness.

## Unity-side exporter (C#)

A standalone Editor script (menu item / invokable method) uses
`AssetDatabase.GetDependencies(path, recursive: false)` over all assets and
writes `verify.json`:

```json
{
  "unityVersion": "2022.3.x",
  "exportedAt": "<iso8601>",
  "assets": [
    {
      "path": "Assets/Prefabs/Player.prefab",
      "guid": "8f2a1c...",
      "dependencies": ["Assets/Materials/body.mat", "..."]
    }
  ]
}
```

Constraints:
- Editor-only; never ships in a build.
- Non-recursive dependencies per asset (the graph handles transitivity).
- Runs only when the user invokes it. No automation, no file watcher.

## `verify_index(verify_json_path)`

Diffs Unity's truth against the SQLite graph and reports:

- **Missed edges** — dependencies Unity reports that the static parser did not
  capture (the important signal; drives parser improvements).
- **Extra edges** — edges in the graph Unity does not report (usually explainable:
  builtin refs, self-refs, or Unity pruning).
- **Per-category counts** — grouped by `asset_type` / `ref_kind` to localize gaps.

`index_meta.verify_last_run` records when verification last ran.

## How it fits the goals

After running `verify_index` a few times against a real project, the user knows
exactly how trustworthy the static parser is, and each missed-edge category
becomes a concrete parser story. It is also the ground-truth regression test as
the parser evolves.
