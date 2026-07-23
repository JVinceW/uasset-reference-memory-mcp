# Problem-First Blog Content Handoff Design

**Date:** 2026-07-23  
**Status:** Approved design, pending implementation plan

## Purpose

Create a repository-owned content workspace that helps an AI collaborator in a
separate personal-blog repository write accurate technical articles about this
tool.

This repository owns the technical truth and the problem analysis. The blog
repository owns the finished article, the author's personal voice, publication
formatting, and ongoing editorial maintenance.

The handoff must be useful without turning the article into release notes,
source-code documentation, or a commit-by-commit implementation report.

## Collaboration Model

The workflow is intentionally manual:

1. This repository prepares a self-contained topic folder under
   `docs/content/`.
2. The author gives the relevant folder or Markdown files to the AI working in
   the personal-blog repository.
3. The blog AI turns the brief into a publishable article in the author's
   voice.
4. When the blog AI needs to make a new technical claim, it flags the claim for
   verification instead of inventing evidence.

There is no submodule, subtree, local-path dependency, export command, or
automatic synchronization in the initial version.

## Directory Structure

Each article topic has one portable folder:

```text
docs/content/
  README.md
  <topic-slug>/
    brief.md
    evidence.md
    assets/
```

`README.md` explains the collaboration contract and how to hand a topic to
another AI.

`brief.md` provides writing direction. `evidence.md` provides the verified
technical foundation. `assets/` is optional and contains only handoff-ready
diagrams, screenshots, or supporting data.

Every topic folder must remain understandable on its own. The receiving AI
should not need to discover undocumented dependencies elsewhere in the
repository before it can start writing.

## `brief.md` Contract

The writing brief is problem-first and uses English by default. It should
contain:

- the real-world pain point;
- the people who experience it;
- why the obvious solution is insufficient;
- misleading assumptions that make the problem difficult;
- the correct mental model;
- the solution principles;
- important trade-offs and unresolved risks;
- a recommended narrative arc and article outline;
- concrete examples or analogies;
- suggested diagrams;
- small pseudocode or code fragments only when they clarify an idea;
- required factual points;
- claims or implications the writer must avoid; and
- optional questions the writer can explore in the author's own voice.

The brief is not a near-complete article. The blog AI may change the outline,
examples, pacing, and prose while preserving the verified technical meaning.

## `evidence.md` Contract

The evidence file supports fact-checking without forcing repository mechanics
into the published story. It should contain:

- concrete failure scenarios;
- observable symptoms;
- root causes;
- relevant Unity behavior and terminology;
- the decisions made and the reasoning behind them;
- alternatives considered;
- conceptual validation outcomes;
- known limitations and deferred problems; and
- a concise terminology glossary.

A short private fact-check appendix may link to relevant repository documents
or small source-code locations. These references exist for verification and
normally should not appear in the article.

Release numbers, commit hashes, detailed changed-file lists, and changelog
language are not standard content fields.

## Narrative Policy

Articles produced from these handoffs should begin with the reader's problem
and pain, then explain the mental model that makes the solution understandable.
Implementation details are supporting material, not the main subject.

For example, the reindexing topic should lead with the danger of an asset graph
that appears current while silently describing an older project state. It
should then explain why path and timestamp alone are weaker than Unity's GUID
identity model.

Code should be included only when a small example makes a concept clearer than
prose or a diagram. The handoff should not require the reader to understand
this repository's internal architecture.

## Authority And Accuracy

`evidence.md` is authoritative for technical claims in its topic folder.
`brief.md` is authoritative for the intended angle and teaching goals.

The blog AI may:

- rewrite the narrative in the author's voice;
- reorder sections;
- replace analogies;
- shorten or expand explanations; and
- omit implementation detail that does not serve the reader.

The blog AI must not:

- contradict the evidence;
- present deferred behavior as implemented;
- invent benchmarks, incidents, user reports, or technical guarantees;
- convert a limitation into a solved claim; or
- silently introduce a new technical assertion.

Unverified new assertions should be marked for follow-up with the maintainer of
this repository.

## Initial Topic

The first topic will adapt the existing v0.3.1 reindex reliability author brief
into the new problem-first format. It should focus on:

- why asset indexing becomes unreliable during moves, renames, meta changes,
  and Addressables migrations;
- why GUID is identity while path is mutable metadata;
- why incremental freshness requires treating an asset and its `.meta` as one
  logical unit;
- why safe publication matters when ambiguity or partial failure occurs; and
- the trade-off between incremental speed and forced guaranteed freshness.

Release framing and detailed implementation references will be removed from the
main narrative guidance.

## Scope Boundaries

The initial implementation includes the folder convention, collaboration
instructions, reusable templates, and the first reindexing topic.

It does not include:

- automatic synchronization with the personal-blog repository;
- an export CLI;
- a finished article;
- publication automation;
- blog-platform formatting;
- SEO generation;
- analytics; or
- ownership of the author's final voice.

## Acceptance Criteria

The design is successfully implemented when:

1. `docs/content/README.md` explains the manual two-repository workflow.
2. Reusable `brief.md` and `evidence.md` templates express the contracts above.
3. A self-contained reindexing topic follows those templates.
4. The reindexing brief leads with pain, mental model, and trade-offs rather
   than release or commit history.
5. Repository references are limited to a private fact-check appendix.
6. The receiving blog AI can begin writing from the topic folder without
   searching this repository for missing context.
