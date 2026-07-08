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

describe("scan config", () => {
  test("defaults to empty ignore list with defaults applied", () => {
    expect(DEFAULT_CONFIG.scan).toEqual({ ignore: [], ignoreDefaults: true });
  });

  test("reads user ignore patterns and the ignoreDefaults toggle", () => {
    const cfg = parseConfig('{"scan":{"ignore":["*.bak","**/Temp"],"ignoreDefaults":false}}');
    expect(cfg.scan.ignore).toEqual(["*.bak", "**/Temp"]);
    expect(cfg.scan.ignoreDefaults).toBe(false);
  });

  test("drops non-string ignore entries and non-boolean toggles", () => {
    const cfg = parseConfig('{"scan":{"ignore":["ok",5,null],"ignoreDefaults":"nope"}}');
    expect(cfg.scan.ignore).toEqual(["ok"]);
    expect(cfg.scan.ignoreDefaults).toBe(true);
  });
});
