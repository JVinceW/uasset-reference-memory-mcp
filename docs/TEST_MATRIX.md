# Test Matrix

This file maps product behavior to proof.

Rows are added as story packets are implemented. Do not mark a row implemented
until tests or validation evidence exist.

## Status Values

| Status | Meaning |
| --- | --- |
| planned | Accepted as intended behavior, not implemented |
| in_progress | Actively being built |
| implemented | Implemented and proof exists |
| changed | Contract changed after earlier implementation |
| retired | No longer part of the product contract |

## Matrix

| Story | Contract | Unit | Integration | E2E | Platform | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| US-023 | Unity export validation, GUID-pair diff, bounded MCP/CLI summary, full on-disk report | yes | yes | no | pending Unity Editor smoke | implemented | `npm test` (195); `npm run typecheck`; `npm run build`; root and UPM `npm pack --dry-run`; platform proof pending |

## Evidence Rules

- Unit proof covers pure domain and application rules.
- Integration proof covers backend enforcement, data integrity, provider
  behavior, jobs, or service contracts.
- E2E proof covers user-visible browser flows.
- Platform proof covers only shell, deployment, mobile, desktop, or runtime
  behavior that cannot be proven in lower layers.
- A story can be implemented without every proof column if the story packet
  explains why.
