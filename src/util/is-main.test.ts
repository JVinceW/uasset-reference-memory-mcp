import { mkdtemp, writeFile, symlink, rm } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { isMainModule } from "./is-main.js";

let dir: string;
let savedArgv1: string | undefined;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "is-main-"));
  savedArgv1 = process.argv[1];
});
afterEach(async () => {
  process.argv[1] = savedArgv1!;
  await rm(dir, { recursive: true, force: true });
});

describe("isMainModule", () => {
  test("returns true when argv[1] is a symlink to the module file", async () => {
    const real = join(dir, "real.js");
    const link = join(dir, "bin-link");
    await writeFile(real, "");
    await symlink(real, link);

    process.argv[1] = link; // simulate `node_modules/.bin/tool` symlink invocation
    const realUrl = pathToFileURL(realpathSync(real)).href;
    expect(isMainModule(realUrl)).toBe(true);
  });

  test("returns false for a different module url", async () => {
    const real = join(dir, "real.js");
    await writeFile(real, "");
    process.argv[1] = real;
    expect(isMainModule(pathToFileURL(join(dir, "other.js")).href)).toBe(false);
  });

  test("returns false when argv[1] is absent", () => {
    delete process.argv[1];
    expect(isMainModule("file:///whatever.js")).toBe(false);
  });
});
