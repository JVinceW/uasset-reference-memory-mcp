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

const GROUP_MARKER = /^(\s*)m_SerializeEntries:\s*(?:\[\])?\s*$/;
const YAML_DOCUMENT = /^---(?:\s|$)/;
const ADDRESSABLE_GROUP_SCRIPT_GUID = "bbb281ee3bf0b054c82ac2347e9e782c";
const SCRIPT_GUID = /^\s*m_Script:\s*\{[^}]*\bguid:\s*([0-9a-fA-F]{32})\b[^}]*\}\s*$/;
const GROUP_NAME = /^m_Name:\s*(.*?)\s*$/;
const GROUP_GUID = /^m_GUID:\s*([0-9a-fA-F]{32})\s*$/;
const ENTRY_GUID = /^-\s*m_GUID:\s*([0-9a-fA-F]{32})\s*$/;
const ADDRESS = /^\s*m_Address:\s*(.*?)\s*$/;
const READ_ONLY = /^\s*m_ReadOnly:\s*([01])\s*$/;
const LABELS = /^\s*m_(?:Serialized)?Labels:\s*(?:\[\])?\s*$/;
const LABEL = /^\s*-\s*(.*?)\s*$/;
const ENTRY_FIELD = /^\s*m_[A-Za-z]/;
const SIBLING_FIELD = /^[^\s-][^:]*:\s*/;

export function extractAddressableGroup(
  content: string,
  source: AddressableGroupSource,
): AddressableGroup | null {
  if (!source.path.toLowerCase().endsWith(".asset")) return null;
  const lines = content.split(/\r?\n/);
  const document = findAddressableGroupDocument(lines);
  if (!document) return null;
  const { markerIndex, documentStart, documentEnd } = document;
  const groupIndent = GROUP_MARKER.exec(lines[markerIndex]!)![1]!;

  let name: string | undefined;
  let groupGuid: string | undefined;
  for (let i = documentStart; i < markerIndex; i++) {
    const field = atIndent(lines[i]!, groupIndent);
    if (field === null) continue;

    const nameMatch = GROUP_NAME.exec(field);
    if (nameMatch) name = nameMatch[1]!;

    const guidMatch = GROUP_GUID.exec(field);
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
    entries: parseEntries(lines, markerIndex + 1, groupIndent, documentEnd),
  };
}

function findAddressableGroupDocument(
  lines: string[],
): { markerIndex: number; documentStart: number; documentEnd: number } | null {
  for (let markerIndex = 0; markerIndex < lines.length; markerIndex++) {
    if (!GROUP_MARKER.test(lines[markerIndex]!)) continue;

    let documentStart = 0;
    for (let i = markerIndex - 1; i >= 0; i--) {
      if (YAML_DOCUMENT.test(lines[i]!)) {
        documentStart = i;
        break;
      }
    }

    let documentEnd = lines.length;
    for (let i = markerIndex + 1; i < lines.length; i++) {
      if (YAML_DOCUMENT.test(lines[i]!)) {
        documentEnd = i;
        break;
      }
    }

    const hasAddressableGroupScript = lines
      .slice(documentStart, documentEnd)
      .some((line) => SCRIPT_GUID.exec(line)?.[1]?.toLowerCase() === ADDRESSABLE_GROUP_SCRIPT_GUID);
    if (hasAddressableGroupScript) return { markerIndex, documentStart, documentEnd };
  }

  return null;
}

function atIndent(line: string, indent: string): string | null {
  if (!line.startsWith(indent)) return null;
  const remainder = line.slice(indent.length);
  return /^\s/.test(remainder) ? null : remainder;
}

function parseEntries(
  lines: string[],
  startIndex: number,
  groupIndent: string,
  documentEnd: number,
): AddressableGroupEntry[] {
  const entries: AddressableGroupEntry[] = [];
  let endIndex = documentEnd;
  for (let i = startIndex; i < documentEnd; i++) {
    const field = atIndent(lines[i]!, groupIndent);
    if (field !== null && SIBLING_FIELD.test(field)) {
      endIndex = i;
      break;
    }
  }

  for (let i = startIndex; i < endIndex; i++) {
    const entryLine = atIndent(lines[i]!, groupIndent);
    const guidMatch = entryLine === null ? null : ENTRY_GUID.exec(entryLine);
    if (!guidMatch) continue;

    const entry: AddressableGroupEntry = {
      guid: guidMatch[1]!.toLowerCase(),
      address: "",
      readOnly: false,
      labels: [],
    };
    const seenLabels = new Set<string>();
    let readingLabels = false;

    for (let j = i + 1; j < endIndex; j++) {
      const nextEntryLine = atIndent(lines[j]!, groupIndent);
      if (nextEntryLine !== null && ENTRY_GUID.test(nextEntryLine)) break;

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
