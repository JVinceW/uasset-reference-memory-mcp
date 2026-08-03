import type { AssetType } from "../data/apiTypes";

export const ASSET_HUES: Record<AssetType, number> = {
  Scene: 250,
  Prefab: 195,
  Material: 300,
  Texture: 80,
  Script: 145,
  Shader: 340,
  AnimationClip: 160,
  AnimatorController: 175,
  ScriptableObject: 265,
  Sprite: 20,
  AudioClip: 40,
  Font: 110,
  Model: 220,
  Folder: 0,
  Other: 0,
};

export function assetColor(type: AssetType): string {
  return `oklch(0.72 0.15 ${ASSET_HUES[type]})`;
}

export function assetThreeColor(type: AssetType): string {
  const hue = ASSET_HUES[type];
  return `hsl(${hue}, 68%, 58%)`;
}
