import type { AssetType } from "./types.js";

/** Extension (without dot, lowercased) -> asset type. */
const EXTENSION_TYPES: Record<string, AssetType> = {
  prefab: "Prefab",
  unity: "Scene",
  mat: "Material",
  cs: "Script",
  shader: "Shader",
  shadergraph: "Shader",
  shadersubgraph: "Shader",
  compute: "Shader",
  anim: "AnimationClip",
  controller: "AnimatorController",
  overridecontroller: "AnimatorController",
  asset: "ScriptableObject",
  // Textures / images
  png: "Texture",
  jpg: "Texture",
  jpeg: "Texture",
  tga: "Texture",
  psd: "Texture",
  tif: "Texture",
  tiff: "Texture",
  exr: "Texture",
  bmp: "Texture",
  gif: "Texture",
  hdr: "Texture",
  // Models
  fbx: "Model",
  obj: "Model",
  blend: "Model",
  dae: "Model",
  "3ds": "Model",
  // Audio
  wav: "AudioClip",
  mp3: "AudioClip",
  ogg: "AudioClip",
  aiff: "AudioClip",
  aif: "AudioClip",
  // Fonts
  ttf: "Font",
  otf: "Font",
  fontsettings: "Font",
};

/** Text YAML asset extensions the ref-extractor (US-002) can scan for guid refs. */
const YAML_ASSET_EXTENSIONS = new Set<string>([
  "prefab",
  "unity",
  "mat",
  "asset",
  "anim",
  "controller",
  "overridecontroller",
  "spriteatlas",
  "playable",
  "mask",
  "physicmaterial",
  "physicsmaterial2d",
  "guiskin",
  "mixer",
  "preset",
  "renderTexture".toLowerCase(),
  "cubemap",
  "terrainlayer",
  "signal",
  "shadervariants",
]);

function extensionOf(assetPath: string): string {
  const base = assetPath.slice(assetPath.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot === -1 ? "" : base.slice(dot + 1).toLowerCase();
}

/**
 * Classify an asset by its path extension, refined by the `.meta` importer type.
 * `importerType === "folder"` (from parseImporterType) yields Folder.
 */
export function classifyAssetType(
  assetPath: string,
  importerType?: string | null,
): AssetType {
  if (importerType === "folder") return "Folder";
  return EXTENSION_TYPES[extensionOf(assetPath)] ?? "Other";
}

/** True when the file is a text-YAML asset the ref-extractor can scan. */
export function isYamlAsset(assetPath: string): boolean {
  return YAML_ASSET_EXTENSIONS.has(extensionOf(assetPath));
}
