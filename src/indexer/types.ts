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

export interface ScanRoot {
  physicalRoot: string;
  /** Forward-slash Unity path used in the graph. */
  virtualRoot: string;
  origin: Exclude<Origin, "builtin">;
  packageId: string | null;
}

export interface PackageDiscoveryResult {
  roots: ScanRoot[];
  warnings: ScanWarning[];
  fingerprint: string;
}

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
  /** Physical path used only during this index run; never stored in SQLite. */
  sourcePath?: string;
}

export const REF_KINDS = [
  "USES_SCRIPT",
  "USES_MATERIAL",
  "USES_TEXTURE",
  "USES_SHADER",
  "USES_MESH",
  "USES_ANIMATION",
  "NESTED_PREFAB",
  "SERIALIZED_REF",
] as const;

export type RefKind = (typeof REF_KINDS)[number];

/** One reference edge (produced by the ref-extractor, US-002). */
export interface Edge {
  fromGuid: string;
  toGuid: string;
  refKind: RefKind;
  fileId: string | null;
  /** Best-effort YAML property name at the reference site. */
  context: string | null;
  count: number;
}

/** A reference to a GUID that resolves to no known asset (US-002). */
export interface UnresolvedRef {
  fromGuid: string;
  toGuid: string;
  context: string | null;
}

export type ScanWarningKind =
  | "orphan-meta"
  | "missing-meta"
  | "invalid-meta"
  | "guid-replaced"
  | "unreadable-asset"
  | "binary-serialized"
  | "package-discovery";

export interface ScanWarning {
  kind: ScanWarningKind;
  /** Project-relative path the warning is about. */
  path: string;
  message: string;
}

export interface ScanResult {
  nodes: AssetNode[];
  warnings: ScanWarning[];
  packageFingerprint?: string;
}
