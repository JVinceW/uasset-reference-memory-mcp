import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { findProjectRoot, isProjectRoot } from "./project-root.js";

/** A fake filesystem: only the listed paths exist. */
const fs = (...paths: string[]) => {
  const set = new Set(paths);
  return (p: string) => set.has(p);
};

describe("isProjectRoot", () => {
  test("recognises an indexed project by .asset-memory", () => {
    expect(isProjectRoot("/proj", fs(join("/proj", ".asset-memory")))).toBe(true);
  });

  test("recognises an un-indexed Unity project by Assets + ProjectSettings", () => {
    const exists = fs(join("/proj", "Assets"), join("/proj", "ProjectSettings"));
    expect(isProjectRoot("/proj", exists)).toBe(true);
  });

  test("rejects a directory with only one Unity marker", () => {
    expect(isProjectRoot("/proj", fs(join("/proj", "Assets")))).toBe(false);
  });

  test("rejects an unrelated directory", () => {
    expect(isProjectRoot("/somewhere", fs("/somewhere/src"))).toBe(false);
  });
});

describe("findProjectRoot", () => {
  test("finds the root when already standing in it", () => {
    expect(findProjectRoot("/proj", fs(join("/proj", ".asset-memory")))).toBe("/proj");
  });

  test("walks up from a nested subdirectory", () => {
    const exists = fs(join("/proj", "Assets"), join("/proj", "ProjectSettings"));
    expect(findProjectRoot("/proj/Assets/Art/Materials", exists)).toBe("/proj");
  });

  test("returns null rather than looping when no project is above", () => {
    expect(findProjectRoot("/a/b/c", fs())).toBeNull();
  });

  test("stops at the nearest project when projects are nested", () => {
    const exists = fs(join("/outer", ".asset-memory"), join("/outer/inner", ".asset-memory"));
    expect(findProjectRoot("/outer/inner/sub", exists)).toBe("/outer/inner");
  });
});
