import type { AssetNode } from "./types.js";

/**
 * Unity's built-in assets live at well-known sentinel GUIDs and never exist on
 * disk. Assets reference them constantly (Default-Material, the built-in sprite,
 * the Standard shader, primitive meshes, the default font). We seed one synthetic
 * node per sentinel GUID so those references resolve instead of appearing as
 * broken (US-004). Because we track references at GUID granularity, a single node
 * per GUID is enough; the specific built-in object (by fileID) is not modelled.
 */
interface BuiltinSpec {
  guid: string;
  name: string;
  /** Synthetic, stable project-relative path (never read from disk). */
  path: string;
}

const BUILTIN_SPECS: BuiltinSpec[] = [
  {
    guid: "0000000000000000f000000000000000",
    name: "unity_builtin_extra",
    path: "Resources/unity_builtin_extra",
  },
  {
    guid: "0000000000000000e000000000000000",
    name: "unity default resources",
    path: "Library/unity default resources",
  },
];

export const BUILTIN_GUIDS: readonly string[] = BUILTIN_SPECS.map((s) => s.guid);

export const BUILTIN_NODES: readonly AssetNode[] = BUILTIN_SPECS.map((s) => ({
  guid: s.guid,
  path: s.path,
  name: s.name,
  assetType: "Other",
  origin: "builtin",
  packageId: null,
  fileSize: null,
  mtime: 0,
  isBinary: true,
}));
