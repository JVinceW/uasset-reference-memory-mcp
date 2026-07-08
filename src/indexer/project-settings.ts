import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type SerializationMode = "mixed" | "binary" | "text" | "unknown";

const MODE_LINE = /^\s*m_SerializationMode:\s*([012])\s*$/m;
const MODES: Record<string, SerializationMode> = { "0": "mixed", "1": "binary", "2": "text" };

/** Parse Unity's `m_SerializationMode` (0=Mixed, 1=ForceBinary, 2=ForceText). */
export function parseSerializationMode(editorSettingsContent: string): SerializationMode {
  const match = MODE_LINE.exec(editorSettingsContent);
  return match ? MODES[match[1]!]! : "unknown";
}

/** Read the project's asset serialization mode from ProjectSettings, or 'unknown'. */
export async function readSerializationMode(projectRoot: string): Promise<SerializationMode> {
  try {
    const content = await readFile(
      join(projectRoot, "ProjectSettings", "EditorSettings.asset"),
      "utf8",
    );
    return parseSerializationMode(content);
  } catch {
    return "unknown";
  }
}
