# Cycles

This directory holds the design-first notes for XYPH's next bounded slices of
work.

The core design corpus under [`/Users/james/git/xyph/design`](../README.md)
defines enduring product truth:

- sponsor actors
- hills
- invariants
- playbacks
- product model

The files here are different. They describe the next concrete cycle after
backlog reconciliation has already happened in the graph.

## Why This Directory Exists

XYPH now has enough active product work that "the next slice" should not live
only in branch names, commit messages, or chat memory.

Each note in this directory should capture:

- the graph-backed work item that anchors the cycle
- the sponsor actors the cycle is meant to help
- the hill or outcome being improved
- the invariants that must not be violated
- the acceptance-test plan that will become executable spec
- the explicit non-goals for the cycle

The purpose is not ceremony. The purpose is to keep the next slice legible
before code starts to accumulate around it.

## Relationship To The Graph

The graph is still the plan.

Cycle notes do not replace the backlog, intent graph, or governed work
artifacts. They are the design-side companion to the graph-visible plan state.

The expected order is:

1. reconcile the backlog in the graph
2. choose the next bounded cycle
3. write or update the cycle note here
4. write the acceptance tests
5. implement

If a cycle is not anchored to graph-visible work, it is not ready to be treated
as an active XYPH slice.

## Cycle Closeout Gate

Cycle notes are not complete when the implementation ships. A cycle closes only
after behavior, docs, backlog, and graveyard have been reconciled.

At minimum, closeout should answer:

1. did the acceptance tests land and pass?
2. do the README and design corpus still describe the current product honestly?
3. which backlog items were added, superseded, or rejected?
4. did any graveyarded work deserve reopening under the current doctrine?
5. what is the next cycle, and why?

This should be a lightweight gate, not process theater. The point is simply to
keep the graph, the corpus, and the product from drifting apart again.

## What Belongs Here

Good cycle notes are:

- bounded
- outcome-driven
- explicit about scope and non-goals
- grounded in sponsor actors
- clear about how the slice will be judged done

Good examples:

- a new product vertical
- a bounded governance or suggestion slice
- a compatibility or debt-reduction cycle
- a focused hardening pass for a specific surface such as the agent CLI

Bad examples:

- generic wishlists
- long-term roadmap prose
- implementation diaries
- branch-by-branch progress logs

Those belong in the graph, the changelog, or retrospectives instead.

## How To Use This Directory

- add a new note when a new bounded cycle starts
- update an existing note if the design intent of the active cycle changes
- keep the note short enough to guide work, but concrete enough to constrain it

The rule is simple: if the next slice is important enough to shape tests and
implementation, it should be explicit here before the codebase starts bending
around it.

## Current Notes

1. [Suggestion Adoption and Explainability](./0001-suggestion-adoption.md)
2. [Agent CLI Hardening](./0002-agent-cli-hardening.md)
3. [Case-Driven Governance](./0003-case-driven-governance.md)
