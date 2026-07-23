# Problem-First Blog Content Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a portable, problem-first content workspace that gives an AI in a separate personal-blog repository enough verified context to write accurate technical articles about this tool.

**Architecture:** This repository owns a self-contained folder per article topic. Each topic separates narrative direction in `brief.md` from technical truth in `evidence.md`; the receiving blog AI manually consumes those files and owns the final prose, voice, and publication format.

**Tech Stack:** Markdown, repository documentation, PowerShell validation, Git.

## Global Constraints

- Store the content workspace under `docs/content/`.
- Use English for briefs and evidence by default.
- Keep handoff manual; add no export command, submodule, subtree, or automatic synchronization.
- Lead with problems, symptoms, mental models, decisions, and trade-offs.
- Do not make release numbers, commit hashes, changed-file lists, or changelog language standard content fields.
- Keep source-code references small and private to fact-checking; do not make repository internals the article's main subject.
- The blog AI owns final voice, prose, formatting, and publication.
- The blog AI must flag new technical claims for verification instead of inventing evidence.
- Do not create a finished article, SEO content, analytics, or publication automation.

Date: 2026-07-23

## Status

Active

## Outcome

`docs/content/` contains a collaboration guide, reusable brief and evidence
templates, and a self-contained Unity reindexing topic that another AI can use
without searching the rest of this repository for missing context.

## Context

- Approved design:
  `docs/superpowers/specs/2026-07-23-blog-content-handoff-design.md`
- Existing source brief:
  `docs/releases/v0.3.1-reindex-blog-brief.md`
- Current reindex behavior:
  `docs/product/reindexing-workflow.md`
- Indexing failure and recovery behavior:
  `docs/product/indexing.md`
- Relevant lasting decisions:
  `docs/decisions/0011-one-logical-asset-meta-aware-freshness.md`,
  `docs/decisions/0013-guid-first-move-rename-reconciliation.md`,
  `docs/decisions/0014-same-path-guid-replacement.md`,
  `docs/decisions/0015-fail-on-duplicate-asset-guids.md`,
  `docs/decisions/0016-force-is-guaranteed-freshness.md`,
  `docs/decisions/0017-follow-unity-incomplete-asset-pair-workflow.md`, and
  `docs/decisions/0018-agent-managed-index-refresh.md`

## Scope

In scope:

- Collaboration instructions for the two-repository, two-AI workflow.
- Reusable problem-first writing-brief and evidence templates.
- One complete content pack about reliable Unity asset reindexing.
- Documentation-map navigation to the new content workspace.

Out of scope:

- A finished blog post.
- Automatic transfer to the personal-blog repository.
- Blog-platform formatting, SEO, publishing, or analytics.
- New product behavior or source-code changes.
- Generated diagrams or screenshots for the first content pack.

## File Structure

```text
docs/
  README.md
  content/
    README.md
    templates/
      brief.md
      evidence.md
    unity-asset-reindexing/
      brief.md
      evidence.md
```

Each file has one responsibility:

- `docs/content/README.md`: collaboration and manual-handoff contract.
- `docs/content/templates/brief.md`: reusable narrative-direction contract.
- `docs/content/templates/evidence.md`: reusable technical-truth contract.
- `docs/content/unity-asset-reindexing/brief.md`: problem-first writing
  direction for the initial article.
- `docs/content/unity-asset-reindexing/evidence.md`: self-contained verified
  facts, decisions, limitations, and private fact-check references.
- `docs/README.md`: discoverability only.

## Risks And Recovery

- **Risk: the content reads like release notes.** Reject release chronology,
  commit summaries, and changed-file inventories from the topic's main
  sections; retain only problem, mental model, decisions, and trade-offs.
- **Risk: the blog AI invents facts to bridge missing context.** Make each
  topic self-contained and explicitly require new claims to be flagged.
- **Risk: `brief.md` and `evidence.md` contradict one another.** Validate every
  required claim in the brief against an evidence section before completion.
- **Risk: repository links leak into the published narrative.** Keep them under
  a clearly private fact-check appendix in `evidence.md`.
- **Recovery:** Revert the documentation-only task commit. No runtime, schema,
  package, or publication state is affected.

---

### Task 1: Establish The Reusable Content Handoff Contract

**Files:**

- Create: `docs/content/README.md`
- Create: `docs/content/templates/brief.md`
- Create: `docs/content/templates/evidence.md`
- Modify: `docs/README.md`

**Interfaces:**

- Produces: a manual handoff workflow and the canonical section contract used
  by every topic folder.
- Consumes: the approved design in
  `docs/superpowers/specs/2026-07-23-blog-content-handoff-design.md`.

- [ ] **Step 1: Create the collaboration guide**

Create `docs/content/README.md` with these sections and rules:

```markdown
# Technical Blog Content

This folder prepares verified, problem-first writing material for an AI
collaborator working in a separate personal-blog repository. It does not own
the finished article.

## Ownership

- This repository owns technical accuracy, the problem analysis, solution
  principles, trade-offs, and known limitations.
- The blog repository owns personal voice, narrative polish, formatting, and
  publication.

## Manual Handoff

1. Choose one topic folder.
2. Give its `brief.md` and `evidence.md` to the blog AI.
3. Tell the blog AI to treat `evidence.md` as technical truth and `brief.md` as
   writing direction.
4. Let it reshape the outline and prose without contradicting the evidence.
5. Return any new technical claims here for verification.

## Topic Contract

Each topic is self-contained. `brief.md` explains the reader's pain, mental
model, narrative arc, and teaching goals. `evidence.md` records verified
failure scenarios, root causes, decisions, trade-offs, limitations, and a
private fact-check appendix.

Repository references are verification aids and should not normally appear in
the published article.

## Creating A Topic

Copy both files from `templates/`, replace every instructional comment with
topic-specific content, and omit `assets/` unless handoff-ready visuals exist.
```

- [ ] **Step 2: Create the problem-first brief template**

Create `docs/content/templates/brief.md` with the following headings and
instructional comments:

```markdown
# [Problem-Focused Working Title]

## Audience
<!-- Identify the people who experience this problem. -->

## Reader Pain
<!-- Describe the concrete situation, symptom, and cost. -->

## Central Thesis
<!-- State the mental-model change the reader should leave with. -->

## Why The Obvious Approach Fails
<!-- Explain the attractive but incomplete solution and its failure modes. -->

## Correct Mental Model
<!-- Teach the concepts that make the solution understandable. -->

## Narrative Arc
<!-- Give the recommended progression from pain to insight to trade-offs. -->

## Suggested Outline
<!-- Provide working section headings and the purpose of each section. -->

## Examples And Analogies
<!-- Include concrete scenarios; prefer concepts over repository internals. -->

## Suggested Visuals
<!-- Describe diagrams that materially improve understanding. -->

## Small Technical Illustrations
<!-- Add pseudocode or short code only when it clarifies the mental model. -->

## Required Facts
<!-- List claims that must survive editorial rewriting. -->

## Claims To Avoid
<!-- List unsupported guarantees, solved limitations, or misleading framing. -->

## Questions For The Writer
<!-- Offer optional prompts for the author's experience and personal voice. -->
```

- [ ] **Step 3: Create the evidence template**

Create `docs/content/templates/evidence.md` with:

```markdown
# [Topic] Evidence

## Problem And Observable Symptoms
<!-- Record concrete situations and what the user can observe. -->

## Failure Scenarios
<!-- Describe distinct ways the naive approach becomes wrong or stale. -->

## Root Causes
<!-- Explain why each failure occurs. -->

## Relevant Platform Behavior
<!-- State external platform rules needed to understand the problem. -->

## Decisions And Reasoning
<!-- Record the chosen principles and why alternatives were rejected. -->

## Trade-Offs
<!-- Explain what the solution optimizes and what it deliberately does not. -->

## Validation Outcomes
<!-- State concept-level proof without release or commit chronology. -->

## Known Limitations
<!-- Preserve unresolved risks and recovery guidance. -->

## Terminology
<!-- Define terms the blog AI must use consistently. -->

## Private Fact-Check Appendix
<!-- Link only the smallest relevant repository documents or source locations.
These links normally stay out of the published article. -->
```

- [ ] **Step 4: Add content navigation**

Add this bullet to `docs/README.md` after the `product/` entry:

```markdown
- `content/`: problem-first technical writing briefs and verified evidence for
  manual handoff to a separate blog-writing AI.
```

- [ ] **Step 5: Validate Task 1**

Run:

```powershell
$required = @(
  'docs/content/README.md',
  'docs/content/templates/brief.md',
  'docs/content/templates/evidence.md'
)
$missing = $required | Where-Object { -not (Test-Path $_) }
if ($missing) { throw "Missing files: $($missing -join ', ')" }
rg -n "Manual Handoff|Topic Contract" docs/content/README.md
rg -n "Reader Pain|Correct Mental Model|Claims To Avoid" docs/content/templates/brief.md
rg -n "Failure Scenarios|Known Limitations|Private Fact-Check Appendix" docs/content/templates/evidence.md
git diff --check
```

Expected: no missing files; every `rg` command returns all named sections; the
diff check returns no output.

- [ ] **Step 6: Commit Task 1**

```powershell
git add docs/README.md docs/content/README.md docs/content/templates/brief.md docs/content/templates/evidence.md
git commit -m "docs: add technical blog content workspace"
```

---

### Task 2: Create The Unity Reindexing Content Pack

**Files:**

- Create: `docs/content/unity-asset-reindexing/brief.md`
- Create: `docs/content/unity-asset-reindexing/evidence.md`
- Read for authority:
  `docs/product/reindexing-workflow.md`,
  `docs/product/indexing.md`, and the decisions listed under Context

**Interfaces:**

- Consumes: the section contracts created in Task 1.
- Produces: one self-contained manual handoff that a blog AI can use without
  additional repository discovery.

- [ ] **Step 1: Write the reindexing brief**

Create `docs/content/unity-asset-reindexing/brief.md` using the Task 1 headings.
Its required content is:

- Audience: Unity developers, technical artists, and tooling engineers who
  rely on dependency information during refactors or Addressables migrations.
- Reader pain: a graph may look current while silently representing an older
  project state.
- Thesis: reliable indexing follows GUID identity, treats the asset and
  `.meta` as one logical unit, and publishes only coherent results.
- Obvious approach: compare paths and asset-file timestamps, then update only
  files that appear changed.
- Mental model: GUID is stable identity; path is mutable metadata; the graph is
  a reconciled snapshot rather than a directory listing.
- Narrative arc: painful migration scenario, naive assumptions, Unity
  identity, reconciliation cases, safe publication, speed/freshness trade-off,
  limitations.
- Primary examples: meta-only change, GUID-preserving move, same-path GUID
  replacement, duplicate GUID, incomplete asset/meta pair, stale Addressables
  ownership.
- Suggested visuals: asset plus `.meta` converging on one GUID identity; and a
  before/after reconciliation table.
- Required facts: explicit indexing, incremental normal mode, `force: true`
  freshness path, duplicate ambiguity stops publication, old references are
  not silently retargeted, previous good data survives failed publication.
- Claims to avoid: automatic watchers, Unity callbacks, GUID repair,
  concurrency retry, perfect freshness from timestamps, analytics, or claims
  that every project must use Addressables.
- Writer questions: personal experiences with grep during migrations, the
  moment path identity proved misleading, and how much confidence a tooling
  answer needs before a destructive refactor.

Do not organize the brief around v0.3.1 or copy the release changelog structure.

- [ ] **Step 2: Write the reindexing evidence**

Create `docs/content/unity-asset-reindexing/evidence.md` using the Task 1
evidence headings. It must state:

- A complete logical asset is an asset plus its sibling `.meta`.
- Unity references use the GUID; moves and renames preserve identity when the
  `.meta` moves with the asset.
- Effective incremental freshness observes the newer asset or `.meta`
  timestamp.
- Reconciliation matches by GUID before interpreting the path.
- A same-path new GUID is a replacement, not the same asset.
- Duplicate GUIDs are ambiguous and abort publication.
- Missing or invalid metas exclude incomplete pairs with warnings.
- Changed reference sources and sources affected by target changes are
  re-extracted.
- Addressables rows are generated ownership data refreshed from group assets;
  Addressables is a pressure case, not a prerequisite for using the graph.
- Normal mode is incremental; forced mode rebuilds from current project
  contents when guaranteed freshness is needed.
- Publication uses a temporary database and replaces the prior good database
  only after success.
- Timestamp-preserving operations and concurrent writes remain limitations;
  recovery is to stabilize files and rerun, using force when needed.

Under `Private Fact-Check Appendix`, link only:

```markdown
- [Reindexing workflow](../../product/reindexing-workflow.md)
- [Indexing behavior](../../product/indexing.md)
- [Asset/meta freshness decision](../../decisions/0011-one-logical-asset-meta-aware-freshness.md)
- [GUID-first move decision](../../decisions/0013-guid-first-move-rename-reconciliation.md)
- [Same-path replacement decision](../../decisions/0014-same-path-guid-replacement.md)
- [Duplicate GUID decision](../../decisions/0015-fail-on-duplicate-asset-guids.md)
- [Guaranteed freshness decision](../../decisions/0016-force-is-guaranteed-freshness.md)
- [Incomplete-pair decision](../../decisions/0017-follow-unity-incomplete-asset-pair-workflow.md)
- [Agent-managed refresh decision](../../decisions/0018-agent-managed-index-refresh.md)
```

- [ ] **Step 3: Validate self-containment and problem-first framing**

Run:

```powershell
$topic = 'docs/content/unity-asset-reindexing'
rg -n "Reader Pain|Central Thesis|Correct Mental Model|Claims To Avoid" "$topic/brief.md"
rg -n "Failure Scenarios|Root Causes|Trade-Offs|Known Limitations" "$topic/evidence.md"
rg -n "GUID|\\.meta|Addressables|force" "$topic/brief.md" "$topic/evidence.md"
$releaseFraming = rg -n "v0\\.3\\.1|commit hash|changed files|changelog" "$topic/brief.md" "$topic/evidence.md"
if ($LASTEXITCODE -eq 0) { throw "Release-oriented framing found:`n$releaseFraming" }
if ($LASTEXITCODE -ne 1) { throw "Release-framing scan failed" }
git diff --check
```

Expected: required conceptual sections and terms are present; the
release-framing scan finds no matches; the diff check returns no output.

- [ ] **Step 4: Perform the receiving-AI handoff review**

Read only the two files in `docs/content/unity-asset-reindexing/` and answer:

1. What pain opens the article?
2. Why is path-based indexing insufficient?
3. What is the recommended mental model?
4. Which failure cases must the article cover?
5. Which guarantees must the article not claim?
6. What should the reader do when timestamps or concurrent writes make
   freshness uncertain?

Expected: every answer is explicit in the topic folder without opening another
repository file. If an answer requires discovery elsewhere, add the missing
context to the appropriate topic file and repeat this review.

- [ ] **Step 5: Commit Task 2**

```powershell
git add docs/content/unity-asset-reindexing/brief.md docs/content/unity-asset-reindexing/evidence.md
git commit -m "docs: add Unity reindexing writing brief"
```

---

### Task 3: Close And Validate The Durable Plan

**Files:**

- Move:
  `docs/plans/active/2026-07-23-blog-content-handoff.md` to
  `docs/plans/completed/2026-07-23-blog-content-handoff.md`

**Interfaces:**

- Consumes: the validated content workspace and first topic from Tasks 1-2.
- Produces: completed harness evidence for the documentation change.

- [ ] **Step 1: Run repository-level documentation checks**

Run:

```powershell
git diff --check HEAD~2..HEAD
rg -n "docs/content|content/" docs/README.md docs/content/README.md
$tracked = git ls-files docs/content
if (($tracked | Measure-Object).Count -ne 5) {
  throw "Expected five tracked content files, found $($tracked.Count)"
}
git status --short
```

Expected: no whitespace errors; navigation resolves to the content workspace;
exactly five content files are tracked; only the active plan remains modified
for completion.

- [ ] **Step 2: Record the result and complete the plan**

Update this plan:

- set `Status` to `Completed`;
- check every completed progress item;
- record the two documentation commit hashes under `Result`;
- record the validation commands and outcomes under `Validation`; and
- state that no runtime, package, schema, or blog-repository state changed.

Move the plan:

```powershell
Move-Item -LiteralPath 'docs/plans/active/2026-07-23-blog-content-handoff.md' -Destination 'docs/plans/completed/2026-07-23-blog-content-handoff.md'
```

- [ ] **Step 3: Commit plan completion**

```powershell
git add docs/plans/active/2026-07-23-blog-content-handoff.md docs/plans/completed/2026-07-23-blog-content-handoff.md
git commit -m "docs: complete blog content handoff plan"
```

- [ ] **Step 4: Verify final state**

Run:

```powershell
git diff --check HEAD~3..HEAD
git status --short --branch
```

Expected: no whitespace errors and a clean worktree.

## Progress

- [ ] Task 1: Establish the reusable content handoff contract.
- [ ] Task 2: Create the Unity reindexing content pack.
- [ ] Task 3: Close and validate the durable plan.

## Decisions

- 2026-07-23: Store source-of-truth writing material in this repository under
  `docs/content/`; the personal-blog repository owns finished articles.
- 2026-07-23: Use one self-contained folder per topic.
- 2026-07-23: Separate writing direction (`brief.md`) from verified technical
  truth (`evidence.md`).
- 2026-07-23: Use manual handoff and English by default.
- 2026-07-23: Lead with pain and mental models; keep release and source-code
  mechanics out of the main narrative.

## Validation

- Focused proof: structural scans, problem-first framing scan, fact-link
  validation, and a receiving-AI self-containment review.
- Repository-required checks: `git diff --check` and clean final status.

## Result

Complete after implementation and validation.
