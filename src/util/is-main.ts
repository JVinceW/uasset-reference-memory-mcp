import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * True when the module identified by `importMetaUrl` is the process entry point.
 *
 * Resolves `process.argv[1]` through `realpathSync` first, so the check still
 * works when the tool is launched via an npm bin symlink (`node_modules/.bin/...`)
 * whose path differs from the real module file that `import.meta.url` reports.
 */
export function isMainModule(importMetaUrl: string): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  try {
    return importMetaUrl === pathToFileURL(realpathSync(argv1)).href;
  } catch {
    return false;
  }
}
