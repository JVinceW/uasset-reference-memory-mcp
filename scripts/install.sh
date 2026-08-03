#!/usr/bin/env sh
set -eu

PACKAGE_SPEC="${UNITY_ASSET_REFERENCE_MCP_PACKAGE:-unity-asset-reference-mcp@latest}"
DRY_RUN=0
FORCE=0

usage() {
  cat <<'USAGE'
Install unity-asset-reference-mcp globally with npm.

Usage:
  sh scripts/install.sh [--package <npm-spec>] [--force] [--dry-run]

Options:
  --package <npm-spec>  Package/version to install. Default: unity-asset-reference-mcp@latest
  --force               Pass --force to npm install.
  --dry-run             Print commands and checks without installing.
  -h, --help            Show this help.

Environment:
  UNITY_ASSET_REFERENCE_MCP_PACKAGE  Overrides the default package spec.
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --package)
      if [ "$#" -lt 2 ]; then
        echo "Missing value for --package" >&2
        exit 2
      fi
      PACKAGE_SPEC="$2"
      shift 2
      ;;
    --force)
      FORCE=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    return 1
  fi
}

version_major() {
  "$1" --version | sed 's/^v//' | cut -d. -f1
}

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '[dry-run] %s\n' "$*"
  else
    "$@"
  fi
}

need_cmd node || {
  echo "Install Node.js 20 or newer, then rerun this installer: https://nodejs.org/" >&2
  exit 1
}
need_cmd npm || {
  echo "Install npm with Node.js 20 or newer, then rerun this installer: https://nodejs.org/" >&2
  exit 1
}

NODE_MAJOR="$(version_major node)"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js 20 or newer is required. Found: $(node --version)" >&2
  exit 1
fi

INSTALL_ARGS="install -g"
if [ "$FORCE" -eq 1 ]; then
  INSTALL_ARGS="$INSTALL_ARGS --force"
fi

echo "Installing $PACKAGE_SPEC with npm..."
# shellcheck disable=SC2086
run npm $INSTALL_ARGS "$PACKAGE_SPEC"

if [ "$DRY_RUN" -eq 1 ]; then
  echo "[dry-run] Would verify installed commands:"
  echo "[dry-run]   unity-asset-reference-mcp"
  echo "[dry-run]   unity-asset-reference-mcp-index"
  echo "[dry-run]   unity-asset-reference-mcp-web"
  exit 0
fi

for bin in unity-asset-reference-mcp unity-asset-reference-mcp-index unity-asset-reference-mcp-web; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "Installed package, but '$bin' is not on PATH." >&2
    echo "Check npm global bin path: npm bin -g" >&2
    exit 1
  fi
done

cat <<'DONE'
unity-asset-reference-mcp installed.

Next:
  unity-asset-reference-mcp-index index /path/to/UnityProject --force
  unity-asset-reference-mcp-web --db /path/to/UnityProject/.asset-memory/index.db
DONE
