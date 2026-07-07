import { describe, expect, test } from "vitest";
import { parsePackageId } from "./origin.js";
import { BUILTIN_NODES, BUILTIN_GUIDS } from "./builtins.js";

describe("parsePackageId", () => {
  test.each([
    ["Assets/Prefabs/Player.prefab", null],
    ["Assets", null],
    ["Packages/com.foo.bar/Runtime/X.asset", "com.foo.bar"],
    ["Packages/com.foo.bar", "com.foo.bar"],
    ["Library/PackageCache/com.unity.ugui@1.0.0/X.asset", "com.unity.ugui@1.0.0"],
    ["Library/PackageCache/com.unity.render-pipelines.universal@14.0.8/S.shader",
     "com.unity.render-pipelines.universal@14.0.8"],
  ] as const)("%s -> %s", (path, expected) => {
    expect(parsePackageId(path)).toBe(expected);
  });
});

describe("BUILTIN_NODES", () => {
  test("seeds Unity's default and builtin-extra sentinel guids", () => {
    expect(BUILTIN_GUIDS).toContain("0000000000000000f000000000000000");
    expect(BUILTIN_GUIDS).toContain("0000000000000000e000000000000000");
  });

  test("each builtin node is origin=builtin, binary, no file", () => {
    for (const n of BUILTIN_NODES) {
      expect(n.origin).toBe("builtin");
      expect(n.isBinary).toBe(true);
      expect(n.fileSize).toBeNull();
      expect(BUILTIN_GUIDS).toContain(n.guid);
    }
  });
});
