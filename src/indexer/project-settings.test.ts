import { describe, expect, test } from "vitest";
import { parseSerializationMode } from "./project-settings.js";

describe("parseSerializationMode", () => {
  test.each([
    ["  m_SerializationMode: 0\n", "mixed"],
    ["  m_SerializationMode: 1\n", "binary"],
    ["  m_SerializationMode: 2\n", "text"],
  ] as const)("%s -> %s", (content, expected) => {
    expect(parseSerializationMode(content)).toBe(expected);
  });

  test("returns unknown when the key is absent", () => {
    expect(parseSerializationMode("EditorSettings:\n  m_ExternalVersionControl: x\n")).toBe(
      "unknown",
    );
  });
});
