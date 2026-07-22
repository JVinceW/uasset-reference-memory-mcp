import { describe, expect, test } from "vitest";
import { BUILTIN_NODES } from "./builtins.js";
import {
  assertUniqueAssetGuids,
  DuplicateGuidError,
} from "./guid-validation.js";
import type { AssetNode } from "./types.js";

function node(guid: string, path: string): AssetNode {
  return {
    guid,
    path,
    name: path.split("/").at(-1) ?? path,
    assetType: "Other",
    origin: "project",
    packageId: null,
    fileSize: 1,
    mtime: 0,
    isBinary: false,
  };
}

describe("assertUniqueAssetGuids", () => {
  test("reports duplicate paths in ascending path order", () => {
    const duplicate = "a".repeat(32);

    expect(() => assertUniqueAssetGuids([
      node(duplicate, "Assets/Z.prefab"),
      node(duplicate, "Assets/A.prefab"),
    ])).toThrowError(expect.objectContaining({
      name: "DuplicateGuidError",
      collisions: [{ guid: duplicate, paths: ["Assets/A.prefab", "Assets/Z.prefab"] }],
    }));
  });

  test("reports multiple collisions in ascending GUID order", () => {
    const a = "a".repeat(32);
    const b = "b".repeat(32);

    expect(() => assertUniqueAssetGuids([
      node(b, "Assets/B1.prefab"),
      node(a, "Assets/A2.prefab"),
      node(b, "Assets/B2.prefab"),
      node(a, "Assets/A1.prefab"),
    ])).toThrowError(expect.objectContaining({
      collisions: [
        { guid: a, paths: ["Assets/A1.prefab", "Assets/A2.prefab"] },
        { guid: b, paths: ["Assets/B1.prefab", "Assets/B2.prefab"] },
      ],
    }));
  });

  test("accepts unique scanned GUIDs", () => {
    expect(() => assertUniqueAssetGuids([
      node("a".repeat(32), "Assets/A.prefab"),
      node("b".repeat(32), "Assets/B.prefab"),
    ])).not.toThrow();
  });

  test("rejects a scanned GUID reserved for a built-in node", () => {
    const builtin = BUILTIN_NODES[0];
    if (!builtin) throw new Error("missing built-in node fixture");

    expect(() => assertUniqueAssetGuids(
      [node(builtin.guid, "Assets/Imposter.prefab")],
      BUILTIN_NODES,
    )).toThrowError(expect.objectContaining({
      name: "DuplicateGuidError",
      collisions: [{
        guid: builtin.guid,
        paths: ["Assets/Imposter.prefab", builtin.path].sort(),
      }],
    }));
  });

  test("exposes a typed duplicate GUID error", () => {
    const duplicate = "a".repeat(32);
    try {
      assertUniqueAssetGuids([
        node(duplicate, "Assets/A.prefab"),
        node(duplicate, "Assets/B.prefab"),
      ]);
      throw new Error("expected duplicate GUID validation to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(DuplicateGuidError);
    }
  });
});
