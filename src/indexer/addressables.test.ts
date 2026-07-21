import { describe, expect, test } from "vitest";
import { extractAddressableGroup } from "./addressables.js";

const SOURCE = {
  assetGuid: "f".repeat(32),
  path: "Assets/AddressableAssetsData/AssetGroups/UI.asset",
};
const GROUP_SCRIPT =
  "  m_Script: {fileID: 11500000, guid: bbb281ee3bf0b054c82ac2347e9e782c, type: 3}";

const GROUP = [
  "%YAML 1.1",
  "MonoBehaviour:",
  GROUP_SCRIPT,
  "  m_Name: UI Remote",
  "  m_GUID: 65CB101CAED9D47F4A691DC0DEA916AE",
  "  m_SerializeEntries:",
  "  - m_GUID: 013C6163221E6AB4782143325D5F2080",
  "    m_Address: ui/profile",
  "    m_ReadOnly: 0",
  "    m_Labels:",
  "    - remote",
  "    - ui",
  "    - remote",
  "  - m_GUID: 06521722BFFE44540A3B2D5F8213BEF3",
  "    m_Address: ui/settings",
  "    m_ReadOnly: 1",
  "    m_Labels: []",
].join("\n");

describe("extractAddressableGroup", () => {
  test("returns group identity, entries, labels, and read-only state", () => {
    expect(extractAddressableGroup(GROUP, SOURCE)).toEqual({
      groupGuid: "65cb101caed9d47f4a691dc0dea916ae",
      assetGuid: SOURCE.assetGuid,
      name: "UI Remote",
      path: SOURCE.path,
      entries: [
        {
          guid: "013c6163221e6ab4782143325d5f2080",
          address: "ui/profile",
          readOnly: false,
          labels: ["remote", "ui"],
        },
        {
          guid: "06521722bffe44540a3b2d5f8213bef3",
          address: "ui/settings",
          readOnly: true,
          labels: [],
        },
      ],
    });
  });

  test("returns null for non-group YAML", () => {
    expect(extractAddressableGroup("%YAML 1.1\nMaterial:\n", SOURCE)).toBeNull();
  });

  test("returns null for group-shaped package test fixtures that are not asset files", () => {
    expect(
      extractAddressableGroup(GROUP, {
        ...SOURCE,
        path: "Library/PackageCache/com.unity.addressables/Tests/Expected/Group.unity",
      }),
    ).toBeNull();
  });

  test("returns null for a different MonoBehaviour script with group-shaped fields", () => {
    const yaml = [
      "%YAML 1.1",
      "--- !u!114 &11400000",
      "MonoBehaviour:",
      "  m_Script: {fileID: 11500000, guid: " + "1".repeat(32) + ", type: 3}",
      "  m_Name: Lookalike",
      "  m_GUID: " + "a".repeat(32),
      "  m_SerializeEntries: []",
    ].join("\n");

    expect(extractAddressableGroup(yaml, SOURCE)).toBeNull();
  });

  test("does not borrow the Addressable group script identity from another YAML document", () => {
    const yaml = [
      "%YAML 1.1",
      "--- !u!114 &11400000",
      "MonoBehaviour:",
      GROUP_SCRIPT,
      "  m_Name: Real Script, No Entries",
      "--- !u!114 &11400001",
      "MonoBehaviour:",
      "  m_Script: {fileID: 11500000, guid: " + "1".repeat(32) + ", type: 3}",
      "  m_Name: Lookalike",
      "  m_GUID: " + "a".repeat(32),
      "  m_SerializeEntries: []",
    ].join("\n");

    expect(extractAddressableGroup(yaml, SOURCE)).toBeNull();
  });

  test("parses Unity's serialized labels field", () => {
    const yaml = [
      "MonoBehaviour:",
      GROUP_SCRIPT,
      "  m_Name: Labeled",
      "  m_GUID: " + "a".repeat(32),
      "  m_SerializeEntries:",
      "  - m_GUID: " + "b".repeat(32),
      "    m_Address: labeled",
      "    m_SerializedLabels:",
      "    - preload",
    ].join("\n");

    expect(extractAddressableGroup(yaml, SOURCE)?.entries[0]?.labels).toEqual(["preload"]);
  });

  test("preserves an empty group", () => {
    const yaml =
      "MonoBehaviour:\n" +
      GROUP_SCRIPT +
      "\n  m_Name: Empty\n  m_GUID: " +
      "a".repeat(32) +
      "\n  m_SerializeEntries: []\n";
    expect(extractAddressableGroup(yaml, SOURCE)?.entries).toEqual([]);
  });

  test("does not parse GUID items from a later sibling list", () => {
    const yaml = [
      "MonoBehaviour:",
      GROUP_SCRIPT,
      "  m_Name: Bounded",
      "  m_GUID: " + "a".repeat(32),
      "  m_SerializeEntries:",
      "  - m_GUID: " + "b".repeat(32),
      "    m_Address: expected",
      "  m_OtherEntries:",
      "  - m_GUID: " + "c".repeat(32),
      "    m_Address: not-addressable",
    ].join("\n");

    expect(extractAddressableGroup(yaml, SOURCE)?.entries.map((entry) => entry.address)).toEqual(["expected"]);
  });

  test("uses group identity at the entries field indentation", () => {
    const yaml = [
      "MonoBehaviour:",
      GROUP_SCRIPT,
      "  m_Name: Top Level",
      "  m_GUID: " + "a".repeat(32),
      "  m_Nested:",
      "    m_Name: Nested",
      "    m_GUID: " + "b".repeat(32),
      "  m_SerializeEntries: []",
    ].join("\n");

    expect(extractAddressableGroup(yaml, SOURCE)).toMatchObject({
      name: "Top Level",
      groupGuid: "a".repeat(32),
    });
  });

  test("throws a path-aware parse error when marked group YAML lacks identity", () => {
    expect(() => extractAddressableGroup(GROUP_SCRIPT + "\nm_SerializeEntries: []\n", SOURCE)).toThrow(
      /UI\.asset.*missing group name or GUID/,
    );
  });
});
