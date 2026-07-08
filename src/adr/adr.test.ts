import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createAdr, listAdrs, getAdr, updateAdr } from "./adr.js";

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "adr-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe("createAdr", () => {
  test("assigns sequential ids and writes a markdown file", async () => {
    const a = await createAdr(dir, { title: "Use Addressables for UI", decision: "Adopt Addressables" });
    expect(a.id).toBe(1);
    expect(a.path.endsWith("0001-use-addressables-for-ui.md")).toBe(true);
    expect(existsSync(a.path)).toBe(true);

    const b = await createAdr(dir, { title: "Second one" });
    expect(b.id).toBe(2);
  });

  test("defaults status to Proposed", async () => {
    const a = await createAdr(dir, { title: "X" });
    expect(a.status).toBe("Proposed");
  });
});

describe("listAdrs / getAdr", () => {
  test("lists id, title, status; get returns full content", async () => {
    await createAdr(dir, { title: "First", status: "Accepted", context: "why", decision: "do it" });
    await createAdr(dir, { title: "Second" });

    const list = await listAdrs(dir);
    expect(list.map((a) => a.id)).toEqual([1, 2]);
    expect(list[0]).toMatchObject({ title: "First", status: "Accepted" });

    const got = await getAdr(dir, 1);
    expect(got?.title).toBe("First");
    expect(got?.content).toContain("do it");
  });

  test("get returns null for a missing id", async () => {
    expect(await getAdr(dir, 99)).toBeNull();
  });

  test("listAdrs is empty when no adrs exist", async () => {
    expect(await listAdrs(dir)).toEqual([]);
  });
});

describe("updateAdr", () => {
  test("updates status and fields, preserving id/title", async () => {
    await createAdr(dir, { title: "Keep", status: "Proposed", decision: "old" });
    const up = await updateAdr(dir, 1, { status: "Superseded", decision: "new decision" });
    expect(up?.status).toBe("Superseded");

    const got = await getAdr(dir, 1);
    expect(got?.status).toBe("Superseded");
    expect(got?.content).toContain("new decision");
    expect(got?.title).toBe("Keep");
  });

  test("returns null when updating a missing id", async () => {
    expect(await updateAdr(dir, 5, { status: "Accepted" })).toBeNull();
  });
});
