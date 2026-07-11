import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { main } from "./main.js";

const dirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("verify-index CLI", () => {
  test("returns exit 1 when the requested index does not exist", async () => {
    const dir = await mkdtemp(join(tmpdir(), "verify-cli-"));
    dirs.push(dir);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const code = await main(["verify-index", dir, "--verify", join(dir, "verify.json"), "--db", join(dir, "missing.db")]);

    expect(code).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("no index"));
  });
});
