# 0012 Semantic Versioning Release Policy

Date: 2026-07-22

## Status

Accepted

## Context

Release requests need a predictable rule for choosing between patch, minor,
and major version increments. The project is currently pre-1.0, so ordinary
Semantic Versioning guidance also needs an explicit rule for breaking changes
while the major version remains zero.

## Decision

Use `MAJOR.MINOR.PATCH` and classify the complete change set since the latest
published tag before changing the package version:

- PATCH: backward-compatible bug fixes with no new public tools or schema
  changes.
- MINOR: new backward-compatible capabilities, public MCP tools, or additive
  schema behavior.
- MINOR while `0.x`: breaking public API or schema changes, accompanied by an
  explicit upgrade note.
- MAJOR after `1.0.0`: breaking public API or schema changes.

Mixed releases use the largest applicable increment. Published npm versions
and Git tags are immutable and must never be reused or replaced. Ambiguous
classification requires release-owner confirmation before version mutation,
tagging, or publication.

## Alternatives Considered

1. Increment PATCH for every release. Rejected because it hides new capability
   and compatibility changes.
2. Increment MINOR for every pre-1.0 release. Rejected because routine fixes
   would unnecessarily consume minor versions and obscure release intent.
3. Decide versions ad hoc. Rejected because agents and contributors would make
   inconsistent release choices.

## Consequences

Positive:

- Release requests have a repository-owned decision rule.
- Fix-only releases such as reindex correctness work can use `0.3.1`.
- New capabilities remain visibly distinct as `0.4.0` or later.

Tradeoffs:

- Pre-1.0 breaking changes use MINOR rather than MAJOR until the project
  explicitly declares a stable `1.0.0` public contract.
- Mixed or ambiguous release scopes still require human judgment.

## Follow-Up

- Apply the table in `CONTRIBUTING.md` whenever a release is requested.
- Revisit the pre-1.0 rule when planning `1.0.0` stability.
