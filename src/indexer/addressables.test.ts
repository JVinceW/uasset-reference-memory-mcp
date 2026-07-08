import { describe, expect, test } from "vitest";
import { extractAddressableEntries } from "./addressables.js";

const GROUP = [
  "%YAML 1.1",
  "MonoBehaviour:",
  "  m_Name: Default Local Group",
  "  m_GUID: 65cb101caed9d47f4a691dc0dea916ae", // the group's own guid — NOT an entry
  "  m_SerializeEntries:",
  "  - m_GUID: 013c6163221e6ab4782143325d5f2080",
  "    m_Address: Assets/lobby.contents/sounds/bgm/BGM.ogg",
  "    m_ReadOnly: 0",
  "  - m_GUID: 06521722bffe44540a3b2d5f8213bef3",
  "    m_Address: Assets/lobby.contents/sounds/sfx/SFX.ogg",
  "    m_ReadOnly: 0",
].join("\n");

describe("extractAddressableEntries", () => {
  test("returns entries from a group asset (list-item m_GUID + address)", () => {
    const entries = extractAddressableEntries(GROUP);
    expect(entries).toEqual([
      { guid: "013c6163221e6ab4782143325d5f2080", address: "Assets/lobby.contents/sounds/bgm/BGM.ogg" },
      { guid: "06521722bffe44540a3b2d5f8213bef3", address: "Assets/lobby.contents/sounds/sfx/SFX.ogg" },
    ]);
  });

  test("does not include the group's own m_GUID", () => {
    const guids = extractAddressableEntries(GROUP).map((e) => e.guid);
    expect(guids).not.toContain("65cb101caed9d47f4a691dc0dea916ae");
  });

  test("returns [] for assets that are not addressable groups", () => {
    expect(extractAddressableEntries("%YAML 1.1\nMaterial:\n  m_Name: body\n")).toEqual([]);
  });

  test("handles an empty entry list", () => {
    expect(extractAddressableEntries("m_SerializeEntries: []\n")).toEqual([]);
  });
});
