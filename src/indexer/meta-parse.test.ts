import { describe, expect, test } from "vitest";
import { parseGuid, parseImporterType } from "./meta-parse.js";

describe("parseGuid", () => {
  test("extracts the 32-char hex guid from a .meta file", () => {
    const meta = [
      "fileFormatVersion: 2",
      "guid: 8f2a1c0d4e5b6a7c8d9e0f1a2b3c4d5e",
      "PrefabImporter:",
      "  externalObjects: {}",
    ].join("\n");

    expect(parseGuid(meta)).toBe("8f2a1c0d4e5b6a7c8d9e0f1a2b3c4d5e");
  });

  test("returns uppercase hex guid letters in canonical lowercase", () => {
    const meta = [
      "fileFormatVersion: 2",
      "guid: ABCDEF0123456789ABCDEF0123456789",
      "PrefabImporter:",
    ].join("\n");

    expect(parseGuid(meta)).toBe("abcdef0123456789abcdef0123456789");
  });

  test("returns null when no guid line exists", () => {
    expect(parseGuid("fileFormatVersion: 2\n")).toBeNull();
  });

  test("ignores guid-like text that is not the top-level guid key", () => {
    const meta = [
      "fileFormatVersion: 2",
      "guid: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "NativeFormatImporter:",
      "  mainObjectFileID: 11400000",
      "  # guid: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    ].join("\n");

    expect(parseGuid(meta)).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  });
});

describe("parseImporterType", () => {
  test("reads the importer class key from a .meta file", () => {
    const meta = [
      "fileFormatVersion: 2",
      "guid: 8f2a1c0d4e5b6a7c8d9e0f1a2b3c4d5e",
      "TextureImporter:",
      "  internalIDToNameTable: []",
    ].join("\n");

    expect(parseImporterType(meta)).toBe("TextureImporter");
  });

  test("returns 'folder' importer marker when folderAsset is set", () => {
    const meta = [
      "fileFormatVersion: 2",
      "guid: 8f2a1c0d4e5b6a7c8d9e0f1a2b3c4d5e",
      "folderAsset: yes",
      "DefaultImporter:",
      "  externalObjects: {}",
    ].join("\n");

    expect(parseImporterType(meta)).toBe("folder");
  });

  test("returns null when no importer key is present", () => {
    expect(parseImporterType("fileFormatVersion: 2\nguid: a\n")).toBeNull();
  });
});
