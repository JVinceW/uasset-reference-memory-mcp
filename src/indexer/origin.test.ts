import { describe, expect, test } from "vitest";
import { classifyOrigin } from "./origin.js";

describe("classifyOrigin", () => {
  test.each([
    ["Assets/Prefabs/Player.prefab", "project"],
    ["Assets", "project"],
  ] as const)("%s -> %s", (path, expected) => {
    expect(classifyOrigin(path)).toBe(expected);
  });

  test.each([
    ["Packages/com.foo.bar/Runtime/X.prefab", "package"],
    ["Library/PackageCache/com.unity.ugui@1.0.0/X.prefab", "package"],
  ] as const)("%s -> %s", (path, expected) => {
    expect(classifyOrigin(path)).toBe(expected);
  });
});
