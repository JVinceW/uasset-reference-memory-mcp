# Repository Workflow

Repository product behavior, architecture, plans, decisions, code, tests, and
runtime signals are the system of record. Optimize for reliable execution with
minimal process overhead.

## Work Shape

Use an ephemeral plan for a bounded, single-session change. Create one durable
plan under `docs/plans/active/` when work spans sessions, coordinates people or
agents, has meaningful dependencies, needs recovery steps, or would be unsafe
to resume from a diff alone. Use `docs/templates/exec-plan.md` and move the plan
to `docs/plans/completed/` only after validation.

Before editing, identify authority for any new externally observable policy.
Pause for a user decision if product intent is ambiguous, materially different
choices remain open, recovery would be difficult, or validation would weaken.

## Task Flows

For read-only work, inspect only the relevant repository evidence and do not
mutate state.

For a bounded change: inspect the affected behavior and proof, make the smallest
coherent change, run behavior-appropriate validation, and report evidence and
limitations.

For durable planned work: maintain one active plan with context, scope,
approach, risks, progress, decisions, validation, and result; promote lasting
choices to `docs/decisions/`; then complete the plan after validation.

## Evidence

Choose proof from the behavior: focused tests for local rules, integration tests
for boundaries, end-to-end checks for user flows, recovery rehearsal for
migrations, and runtime measurements for reliability claims. Process records do
not substitute for executable or observable evidence.

Completion requires the requested outcome, current relevant documentation,
appropriate proof (or an explicit limitation), and a current completed plan
when a durable plan was required.
