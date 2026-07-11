# Asset Reference Memory Unity Exporter

This Editor-only package exports Unity's direct asset dependencies to a
`verify.json` file for `unity-asset-reference-mcp`.

Install from the repository's Package Manager subfolder:

```text
https://github.com/JVinceW/uasset-reference-memory-mcp.git?path=/unity/com.jvincew.assetreferencememory#<release-tag>
```

In Unity, run **Tools > Asset Reference Memory > Export Verification**. The
exporter writes `<project>/.asset-memory/verify.json`.

Then run:

```text
unity-asset-reference-mcp-index verify-index <project> --verify <project>/.asset-memory/verify.json
```
