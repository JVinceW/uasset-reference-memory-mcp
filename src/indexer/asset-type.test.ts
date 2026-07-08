import { describe, expect, test } from "vitest";
import { classifyAssetType, isYamlAsset } from "./asset-type.js";

describe("classifyAssetType", () => {
  test.each([
    ["Assets/Prefabs/Player.prefab", "Prefab"],
    ["Assets/Scenes/Level.unity", "Scene"],
    ["Assets/Materials/body.mat", "Material"],
    ["Assets/Scripts/PlayerController.cs", "Script"],
    ["Assets/Shaders/Toon.shader", "Shader"],
    ["Assets/Shaders/Water.shadergraph", "Shader"],
    ["Assets/Shaders/Noise.shadersubgraph", "Shader"],
    ["Assets/Compute/Blur.compute", "Shader"],
    ["Assets/Anim/jump.anim", "AnimationClip"],
    ["Assets/Anim/Player.controller", "AnimatorController"],
    ["Assets/Data/Config.asset", "ScriptableObject"],
    ["Assets/Textures/skin.png", "Texture"],
    ["Assets/Models/hero.fbx", "Model"],
    ["Assets/Audio/jump.wav", "AudioClip"],
    ["Assets/Fonts/Roboto.ttf", "Font"],
  ] as const)("maps %s -> %s", (path, expected) => {
    expect(classifyAssetType(path)).toBe(expected);
  });

  test("classifies folders via the folder importer marker", () => {
    expect(classifyAssetType("Assets/Prefabs", "folder")).toBe("Folder");
  });

  test("maps unknown extensions to Other", () => {
    expect(classifyAssetType("Assets/Misc/notes.xyz")).toBe("Other");
  });

  test("is case-insensitive on extension", () => {
    expect(classifyAssetType("Assets/Textures/SKIN.PNG")).toBe("Texture");
  });
});

describe("isYamlAsset", () => {
  test.each([
    "Assets/Prefabs/Player.prefab",
    "Assets/Scenes/Level.unity",
    "Assets/Materials/body.mat",
    "Assets/Data/Config.asset",
    "Assets/Anim/jump.anim",
    "Assets/Anim/Player.controller",
  ])("%s is a scannable YAML asset", (path) => {
    expect(isYamlAsset(path)).toBe(true);
  });

  test.each([
    "Assets/Textures/skin.png",
    "Assets/Models/hero.fbx",
    "Assets/Audio/jump.wav",
    "Assets/Scripts/PlayerController.cs",
    "Assets/Shaders/Toon.shader",
  ])("%s is not a scannable YAML asset", (path) => {
    expect(isYamlAsset(path)).toBe(false);
  });
});
