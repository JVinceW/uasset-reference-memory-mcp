/** Domain types for the static asset index. Mirrors docs/product/asset-graph-model.md. */

export const ASSET_TYPES = [
  "Prefab",
  "Scene",
  "Material",
  "Texture",
  "Script",
  "Shader",
  "AnimationClip",
  "AnimatorController",
  "ScriptableObject",
  "Sprite",
  "AudioClip",
  "Font",
  "Model",
  "Folder",
  "Other",
] as const;

export type AssetType = (typeof ASSET_TYPES)[number];

export type Origin = "project" | "package" | "builtin";

/** One node in the asset graph, produced by the meta-scanner (US-001). */
export interface AssetNode {
  guid: string;
  /** Project-relative, forward-slash path, e.g. "Assets/Prefabs/Player.prefab". */
  path: string;
  /** Basename without directory, e.g. "Player.prefab". */
  name: string;
  assetType: AssetType;
  origin: Origin;
  /** Package id (e.g. "com.unity.ugui@1.0.0") — set by US-004; null in US-001. */
  packageId: string | null;
  /** File size in bytes; null for folders. */
  fileSize: number | null;
  /** Modified time (epoch ms) for incremental re-index. */
  mtime: number;
  /** True when the asset cannot be scanned for outgoing guid references. */
  isBinary: boolean;
}

export type ScanWarningKind = "orphan-meta" | "missing-meta" | "invalid-meta";

export interface ScanWarning {
  kind: ScanWarningKind;
  /** Project-relative path the warning is about. */
  path: string;
  message: string;
}

export interface ScanResult {
  nodes: AssetNode[];
  warnings: ScanWarning[];
}
