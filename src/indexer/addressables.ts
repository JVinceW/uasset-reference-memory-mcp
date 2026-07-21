export interface AddressableGroupEntry {
  guid: string;
  address: string;
  readOnly: boolean;
  labels: string[];
}

export interface AddressableGroup {
  groupGuid: string;
  assetGuid: string;
  name: string;
  path: string;
  entries: AddressableGroupEntry[];
}

export interface AddressableGroupSource {
  assetGuid: string;
  path: string;
}

export class AddressableParseError extends Error {
  constructor(path: string, detail: string) {
    super(`could not parse Addressables group ${path}: ${detail}`);
    this.name = "AddressableParseError";
  }
}

/** Temporary entry-only type retained until the indexer consumes groups. */
export type AddressableEntry = AddressableGroupEntry;

const GROUP_MARKER = /^\s*m_SerializeEntries:\s*(?:\[\])?\s*$/;
const GROUP_NAME = /^\s*m_Name:\s*(.*?)\s*$/;
const GROUP_GUID = /^\s*m_GUID:\s*([0-9a-fA-F]{32})\s*$/;
const ENTRY_GUID = /^\s*-\s*m_GUID:\s*([0-9a-fA-F]{32})\s*$/;
const ADDRESS = /^\s*m_Address:\s*(.*?)\s*$/;
const READ_ONLY = /^\s*m_ReadOnly:\s*([01])\s*$/;
const LABELS = /^\s*m_Labels:\s*(?:\[\])?\s*$/;
const LABEL = /^\s*-\s*(.*?)\s*$/;
const ENTRY_FIELD = /^\s*m_[A-Za-z]/;

export function extractAddressableGroup(
  content: string,
  source: AddressableGroupSource,
): AddressableGroup | null {
  const lines = content.split(/\r?\n/);
  const markerIndex = lines.findIndex((line) => GROUP_MARKER.test(line));
  if (markerIndex === -1) return null;

  let name: string | undefined;
  let groupGuid: string | undefined;
  for (let i = 0; i < markerIndex; i++) {
    const nameMatch = GROUP_NAME.exec(lines[i]!);
    if (nameMatch) name = nameMatch[1]!;

    const guidMatch = GROUP_GUID.exec(lines[i]!);
    if (guidMatch) groupGuid = guidMatch[1]!.toLowerCase();
  }

  if (!name || !groupGuid) {
    throw new AddressableParseError(source.path, "missing group name or GUID");
  }

  return {
    groupGuid,
    assetGuid: source.assetGuid,
    name,
    path: source.path,
    entries: parseEntries(lines, markerIndex + 1),
  };
}

function parseEntries(lines: string[], startIndex: number): AddressableGroupEntry[] {
  const entries: AddressableGroupEntry[] = [];

  for (let i = startIndex; i < lines.length; i++) {
    const guidMatch = ENTRY_GUID.exec(lines[i]!);
    if (!guidMatch) continue;

    const entry: AddressableGroupEntry = {
      guid: guidMatch[1]!.toLowerCase(),
      address: "",
      readOnly: false,
      labels: [],
    };
    const seenLabels = new Set<string>();
    let readingLabels = false;

    for (let j = i + 1; j < lines.length; j++) {
      if (ENTRY_GUID.test(lines[j]!)) break;

      const addressMatch = ADDRESS.exec(lines[j]!);
      if (addressMatch) {
        entry.address = addressMatch[1]!;
        readingLabels = false;
        continue;
      }

      const readOnlyMatch = READ_ONLY.exec(lines[j]!);
      if (readOnlyMatch) {
        entry.readOnly = readOnlyMatch[1] === "1";
        readingLabels = false;
        continue;
      }

      if (LABELS.test(lines[j]!)) {
        readingLabels = !lines[j]!.trimEnd().endsWith("[]");
        continue;
      }

      if (readingLabels) {
        const labelMatch = LABEL.exec(lines[j]!);
        if (labelMatch) {
          const label = labelMatch[1]!;
          if (!seenLabels.has(label)) {
            seenLabels.add(label);
            entry.labels.push(label);
          }
        } else if (ENTRY_FIELD.test(lines[j]!)) {
          readingLabels = false;
        }
      }
    }

    entries.push(entry);
  }

  return entries;
}

/** Compatibility wrapper for the entry-only indexer caller. */
export function extractAddressableEntries(content: string): AddressableEntry[] {
  return extractAddressableGroup(content, { assetGuid: "", path: "<unknown>" })?.entries ?? [];
}
