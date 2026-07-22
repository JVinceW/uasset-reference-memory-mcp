/**
 * Minimal readers for Unity `.meta` files. These are line-oriented YAML files;
 * we only need the top-level `guid` and the importer class key, so we scan lines
 * rather than pulling in a full YAML parser.
 */

const GUID_LINE = /^guid:\s*([0-9a-fA-F]{32})\s*$/;
const IMPORTER_LINE = /^([A-Za-z][A-Za-z0-9]*Importer):\s*$/;
const FOLDER_ASSET_LINE = /^folderAsset:\s*yes\s*$/;

/** Extract the top-level 32-char hex GUID, or null if absent. */
export function parseGuid(metaContent: string): string | null {
  for (const line of metaContent.split("\n")) {
    const match = GUID_LINE.exec(line);
    if (match) return match[1]!.toLowerCase();
  }
  return null;
}

/**
 * Return the importer class name (e.g. `TextureImporter`), the marker `folder`
 * for folder assets, or null when no importer key is present.
 */
export function parseImporterType(metaContent: string): string | null {
  let importer: string | null = null;
  for (const line of metaContent.split("\n")) {
    if (FOLDER_ASSET_LINE.test(line)) return "folder";
    if (importer === null) {
      const match = IMPORTER_LINE.exec(line);
      if (match) importer = match[1]!;
    }
  }
  return importer;
}
