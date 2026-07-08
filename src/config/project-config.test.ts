import { describe, expect, test } from "vitest";
import { parseConfig, configPathFor, DEFAULT_CONFIG } from "./project-config.js";

describe("parseConfig", () => {
  test("returns defaults for empty or absent config", () => {
    expect(parseConfig("{}")).toEqual(DEFAULT_CONFIG);
    expect(DEFAULT_CONFIG.unused.addressableRoots).toBe("auto");
  });

  test("reads a valid addressableRoots setting", () => {
    expect(parseConfig('{"unused":{"addressableRoots":"on"}}').unused.addressableRoots).toBe("on");
    expect(parseConfig('{"unused":{"addressableRoots":"off"}}').unused.addressableRoots).toBe("off");
  });

  test("falls back to default on an invalid value", () => {
    expect(parseConfig('{"unused":{"addressableRoots":"bogus"}}').unused.addressableRoots).toBe("auto");
  });

  test("tolerates malformed JSON by returning defaults", () => {
    expect(parseConfig("not json {")).toEqual(DEFAULT_CONFIG);
  });

  test("ignores unknown keys", () => {
    const cfg = parseConfig('{"unused":{"addressableRoots":"on"},"future":{"x":1}}');
    expect(cfg.unused.addressableRoots).toBe("on");
  });
});

describe("configPathFor", () => {
  test("co-locates config with the index db", () => {
    expect(configPathFor("/proj/.asset-memory/index.db")).toBe("/proj/.asset-memory/config.json");
  });
});
