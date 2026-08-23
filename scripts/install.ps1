[CmdletBinding()]
param(
  [string] $Package = $(if ($env:UNITY_ASSET_REFERENCE_MCP_PACKAGE) { $env:UNITY_ASSET_REFERENCE_MCP_PACKAGE } else { "unity-asset-reference-mcp@latest" }),
  [switch] $Force,
  [switch] $DryRun
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string] $Message)
  Write-Host $Message
}

function Require-Command {
  param([string] $Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $Name"
  }
}

function Get-MajorVersion {
  param([string] $Command)
  $raw = & $Command --version
  $version = $raw.TrimStart("v")
  return [int]($version.Split(".")[0])
}

function Invoke-InstallCommand {
  param([string[]] $Arguments)
  if ($DryRun) {
    Write-Host "[dry-run] npm $($Arguments -join ' ')"
    return
  }

  & npm @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "npm $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
}

try {
  Require-Command node
  Require-Command npm
} catch {
  Write-Error "$($_.Exception.Message). Install Node.js 20 or newer, then rerun this installer: https://nodejs.org/"
  exit 1
}

$nodeMajor = Get-MajorVersion node
if ($nodeMajor -lt 20) {
  Write-Error "Node.js 20 or newer is required. Found: $(node --version)"
  exit 1
}

$installArgs = @("install", "-g")
if ($Force) {
  $installArgs += "--force"
}
$installArgs += $Package

Write-Step "Installing $Package with npm..."
Invoke-InstallCommand -Arguments $installArgs

if ($DryRun) {
  Write-Host "[dry-run] Would verify installed commands:"
  Write-Host "[dry-run]   unity-asset-reference-mcp"
  Write-Host "[dry-run]   unity-asset-reference-mcp-index"
  Write-Host "[dry-run]   unity-asset-reference-mcp-web"
  exit 0
}

$bins = @(
  "unity-asset-reference-mcp",
  "unity-asset-reference-mcp-index",
  "unity-asset-reference-mcp-web"
)

foreach ($bin in $bins) {
  if (-not (Get-Command $bin -ErrorAction SilentlyContinue)) {
    Write-Error "Installed package, but '$bin' is not on PATH. Check npm global bin path with: npm prefix -g"
    exit 1
  }
}

Write-Host @"
unity-asset-reference-mcp installed.

Next:
  unity-asset-reference-mcp-index index C:\path\to\UnityProject --force
  unity-asset-reference-mcp-web --db C:\path\to\UnityProject\.asset-memory\index.db
"@
