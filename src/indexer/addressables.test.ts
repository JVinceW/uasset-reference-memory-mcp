import { describe, expect, test } from "vitest";
import { extractAddressableGroup } from "./addressables.js";

const SOURCE = {
  assetGuid: "f".repeat(32),
  path: "Assets/AddressableAssetsData/AssetGroups/UI.asset",
};

const GROUP = [
  "%YAML 1.1",
  "MonoBehaviour:",
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

  test("preserves an empty group", () => {
    const yaml = "MonoBehaviour:\n  m_Name: Empty\n  m_GUID: " + "a".repeat(32) + "\n  m_SerializeEntries: []\n";
    expect(extractAddressableGroup(yaml, SOURCE)?.entries).toEqual([]);
  });

  test("throws a path-aware parse error when marked group YAML lacks identity", () => {
    expect(() => extractAddressableGroup("m_SerializeEntries: []\n", SOURCE)).toThrow(
      /UI\.asset.*missing group name or GUID/,
    );
  });
});
