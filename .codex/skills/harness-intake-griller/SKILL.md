---
name: harness-intake-griller
description: Use when this repository needs discussion, feature intake, docs, story shaping, Harness task classification, Symphony preparation, or any change that should follow the local Harness workflow before implementation.
---

# Harness Intake Griller

## Overview

Use this repo-local skill to turn a prompt into a Harness-scoped work item before editing. Keep the workflow tied to the files in this repository; do not substitute a global Harness or skill copy.

## Intake Workflow

1. Read the repo entrypoints: `AGENTS.md`, `README.md`, `docs/HARNESS.md`, `docs/FEATURE_INTAKE.md`, `docs/CONTEXT_RULES.md`, and the task-relevant product/story docs.
2. Try the Harness durable layer from the repo root:
   - Windows: `.\scripts\bin\harness-cli.exe query matrix`
   - macOS/Linux: `scripts/bin/harness-cli query matrix`
3. If `scripts/bin/harness-cli*` is missing, continue from markdown context and report the missing binary as Harness friction. Do not invent durable intake, story, backlog, or trace records.
4. Classify the prompt using `docs/FEATURE_INTAKE.md`:
   - input type: new spec, spec slice, change request, new initiative, maintenance request, or harness improvement
   - lane: tiny, normal, or high-risk
   - risk flags and affected docs/stories
5. Before using optional external tools, query the Harness tool registry when the CLI is available:
   - `scripts/bin/harness-cli query tools --capability <name> --status present`
   - If the CLI or provider is absent, cleanly skip and note the gap.
6. For code discovery, prefer connected `codebase-memory-mcp` graph tools over shell search. Fall back to `rg` for string literals, config, docs, and missing-file checks.
7. Work only inside the chosen lane. For normal/high-risk work, create or update story material and validation expectations before implementation.
8. Before finishing, run available validation, inspect `git status --short`, and record a Harness trace if the CLI exists. If the CLI is missing, state that the trace could not be recorded.

## Lane Shortcuts

- Tiny: low-risk docs/config/setup repairs. Patch directly after intake and run the smallest relevant checks.
- Normal: bounded product or process changes. Keep product docs, story docs, and proof status aligned.
- High-risk: auth, authorization, data loss/migration, audit/security, external providers, major public contracts, or 4+ risk flags. Stop for explicit direction if architecture or scope is ambiguous.

## Common Mistakes

- Treating `CLAUDE.md` as the Codex source of truth. Codex should start from `AGENTS.md`; `CLAUDE.md` only imports the same rules for Claude Code.
- Copying agent/router prose into `.codex/skills` when it is really a workflow. Reusable task procedures belong in skills; orchestration handoffs belong in `.codex/workflows`.
- Claiming Harness records were updated when the local binary is absent. Report the attempted command and the blocker instead.
