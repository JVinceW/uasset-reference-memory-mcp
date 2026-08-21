# 0019 Prerelease Channel Policy

Date: 2026-08-21

## Status

Accepted

## Context

[0012](0012-semantic-versioning-release-policy.md) classifies releases as
PATCH, MINOR, or MAJOR but is silent on prereleases. Larger changes — the web
viewer and its five new HTTP routes — benefit from a soak period on real Unity
projects before they become the default install, and there was no rule for how
such a build reaches testers.

The release workflow published with `npm publish --access public --provenance`
and no `--tag`. npm defaults an untagged publish to `latest`, so a prerelease
pushed through that pipeline would have become the default for every
`npm install unity-asset-reference-mcp`, including `scripts/install.sh`, whose
default package spec is `unity-asset-reference-mcp@latest`.

## Decision

Prereleases use a SemVer prerelease identifier on the version the release is
heading toward: `0.4.0-rc.N` for a release candidate, `0.4.0-beta.N` when the
surface is still expected to change. The base version is classified by 0012
exactly as a stable release would be.

`.github/workflows/release.yml` derives the npm dist-tag from the version: a
version containing a hyphen publishes under `next`, everything else under
`latest`. Prereleases therefore never displace the current stable release, and
testers opt in explicitly:

```bash
npm install unity-asset-reference-mcp@next
sh scripts/install.sh --package unity-asset-reference-mcp@next
```

A prerelease is promoted only by moving the tag on the stable version that
follows it, never by retagging the prerelease itself:

```bash
npm dist-tag add unity-asset-reference-mcp@0.4.0 latest
```

Prerelease versions are immutable and are never reused, matching 0012's rule
for stable versions. A prerelease is not required for every release; it is a
release-owner choice for change sets large enough to warrant a soak.

## Alternatives Considered

1. Publish prereleases under `latest` and rely on users pinning versions.
   Rejected because it silently upgrades every unpinned consumer and the
   bundled installer to an untested build.
2. Skip npm and distribute prereleases as GitHub release tarballs only.
   Rejected because testers would not exercise the real install path, which is
   the surface most likely to regress.
3. Maintain a permanent parallel `beta` channel. Rejected as unnecessary
   process for a pre-1.0 project with a single maintainer.

## Consequences

Positive:

- `latest` always resolves to a stable release, so the default install and the
  bundled installers stay safe during a soak.
- Testers have one documented opt-in command.
- The dist-tag follows from the version string, so no release step depends on
  remembering a flag.

Tradeoffs:

- Prerelease versions consume version numbers under the target release, so
  `0.4.0-rc.1` and `0.4.0` are distinct immutable publishes.
- Promotion is a manual `npm dist-tag` step after the stable publish.

## Follow-Up

- Record the `@next` install command in `README.md` when a prerelease is live.
