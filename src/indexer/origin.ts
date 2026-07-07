import type { Origin } from "./types.js";

/**
 * Minimal origin classification by path prefix (US-001).
 *
 * US-004 refines this with `package_id` parsing and pre-seeded `builtin` nodes;
 * here we only distinguish user assets from package assets. `builtin` nodes are
 * synthetic (not produced from a path) and so are never returned here.
 */
export function classifyOrigin(projectRelPath: string): Origin {
  if (
    projectRelPath === "Packages" ||
    projectRelPath.startsWith("Packages/") ||
    projectRelPath === "Library/PackageCache" ||
    projectRelPath.startsWith("Library/PackageCache/")
  ) {
    return "package";
  }
  return "project";
}

const PACKAGE_PREFIXES = ["Packages/", "Library/PackageCache/"];

/**
 * Parse the package id from a package-relative path — the first path segment
 * under `Packages/` or `Library/PackageCache/`. PackageCache segments carry an
 * `@version` suffix (e.g. `com.unity.ugui@1.0.0`); embedded packages do not.
 * Returns null for non-package paths.
 */
export function parsePackageId(projectRelPath: string): string | null {
  for (const prefix of PACKAGE_PREFIXES) {
    if (projectRelPath.startsWith(prefix)) {
      const rest = projectRelPath.slice(prefix.length);
      const seg = rest.split("/")[0];
      return seg && seg.length > 0 ? seg : null;
    }
  }
  return null;
}
