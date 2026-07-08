import { describe, expect, test } from "vitest";
import { matchesAnyGlob } from "./glob.js";

describe("matchesAnyGlob", () => {
  const m = (pats: string[], name: string, path: string) => matchesAnyGlob(pats, name, path);

  test("matches by base name with * wildcard", () => {
    expect(m(["*.bak"], "old.bak", "Assets/x/old.bak")).toBe(true);
    expect(m(["*.bak"], "old.png", "Assets/x/old.png")).toBe(false);
  });

  test("matches an exact name", () => {
    expect(m(["Thumbs.db"], "Thumbs.db", "Assets/Thumbs.db")).toBe(true);
  });

  test("** spans path separators", () => {
    expect(m(["Assets/ThirdParty/**"], "x.cs", "Assets/ThirdParty/lib/x.cs")).toBe(true);
    expect(m(["**/Temp"], "Temp", "Assets/a/b/Temp")).toBe(true);
  });

  test("* does not span separators in a path", () => {
    expect(m(["Assets/*/x.cs"], "x.cs", "Assets/a/x.cs")).toBe(true);
    expect(m(["Assets/*/x.cs"], "x.cs", "Assets/a/b/x.cs")).toBe(false);
  });

  test("no patterns never matches", () => {
    expect(m([], "anything", "Assets/anything")).toBe(false);
  });
});
