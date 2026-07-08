/**
 * Parse AddressableAssetGroup assets (US-013). Entry GUIDs appear as YAML list
 * items under `m_SerializeEntries:` — lines like `- m_GUID: <hex>` followed by
 * `m_Address:`. The group's own top-level `m_GUID:` (no list dash) is skipped.
 * Only files containing `m_SerializeEntries:` are treated as groups.
 */
export interface AddressableEntry {
  guid: string;
  address: string;
}

const GROUP_MARKER = "m_SerializeEntries:";
const ENTRY_GUID = /^\s*-\s*m_GUID:\s*([0-9a-fA-F]{32})\s*$/;
const ADDRESS = /^\s*m_Address:\s*(.*?)\s*$/;

export function extractAddressableEntries(content: string): AddressableEntry[] {
  if (!content.includes(GROUP_MARKER)) return [];

  const entries: AddressableEntry[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = ENTRY_GUID.exec(lines[i]!);
    if (!match) continue;
    const guid = match[1]!.toLowerCase();
    // The address is the next `m_Address:` line within this entry block.
    let address = "";
    for (let j = i + 1; j < lines.length; j++) {
      if (ENTRY_GUID.test(lines[j]!)) break;
      const addr = ADDRESS.exec(lines[j]!);
      if (addr) {
        address = addr[1]!;
        break;
      }
    }
    entries.push({ guid, address });
  }
  return entries;
}
