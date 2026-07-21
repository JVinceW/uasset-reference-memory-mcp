# Harness

This repository uses the current, text-first Harness core. Git-tracked product
documents, architecture, plans, decisions, code, tests, and runtime evidence
are the system of record; no local CLI or Harness database is required.

Read [WORKFLOW.md](WORKFLOW.md) for the canonical task flow and
[README.md](README.md) for the documentation map.

The prior SQLite compatibility layer was removed on 2026-07-21. Its historical
decision records remain under `docs/decisions/`; the new source-of-truth choice
is recorded in `docs/decisions/0009-text-first-harness.md`.
