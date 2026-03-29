# 0005: Quest Detail Read Boundary

## Cycle Type

Debt-reduction / substrate-alignment follow-on

This cycle takes the next bounded step after `0004-substrate-alignment.md`.
The target is narrow on purpose: stop `GraphContext.fetchEntityDetail(task:...)`
from rebuilding the omnibus graph snapshot just to render one quest detail
projection.

## Graph Anchor

- Work item: `task:quest-detail-read-boundary`

## Why This Cycle Exists

XYPH still contains the exact boundary violation the substrate-alignment cycle
warned about:

- `GraphContext.fetchSnapshot()` does `sync -> materialize -> query many node
  families -> batch neighbors -> build a giant app snapshot`
- `GraphContext.fetchEntityDetail(task:...)` falls back to that omnibus path to
  assemble `QuestDetail`
- one targeted read therefore pays whole-graph read-model cost and reinforces
  the false idea that XYPH owns the graph read model

That is the same misuse pattern we called out in Think and in older XYPH code:
materialize broadly, enumerate broadly, then rebuild semantics in app space.

## Sponsor Actors

### Primary sponsor actor

**Operator-Supervisor**

Needs a quest detail or issue-page read to feel honest and direct: inspect one
thing without the application silently rebuilding the world around it.

### Secondary sponsor actors

**Cold-Start Worker Agent**

Needs entity detail reads that do not imply "load the whole graph into memory
first" before the agent can answer one local question.

**Application Integrator**

Needs XYPH to demonstrate the boundary it expects from downstream apps:
targeted reads should stay targeted, and substrate-backed traversal should beat
shadow app-local graph models.

## Outcome Hill

**As a human or agent inspecting one quest, I can read that quest's detail
projection without XYPH first rebuilding the omnibus graph snapshot, so the
application starts behaving like a thin product layer over substrate truth
instead of a second graph runtime.**

## Invariants

This cycle must preserve:

- The graph is the plan.
- git-warp owns substrate facts; XYPH owns meaning.
- Human and agent surfaces must share one reality.
- XYPH must not normalize "whole snapshot first" as the default read model.
- Existing quest-detail behavior must remain semantically intact.
- This cycle narrows `GraphContext`; it does not attempt a reckless full delete.

## Scope

In scope:

- remove the `fetchSnapshot()` fallback from `fetchEntityDetail(task:...)`
- build `QuestDetail` from the quest-local subgraph plus targeted supporting
  queries
- keep existing quest-detail narrative, traceability, submission, and timeline
  behavior green
- encode the boundary as executable spec

Out of scope:

- deleting `GraphContext`
- rewriting dashboard snapshot reads in the same cycle
- changing XYPH ontology or TUI information architecture
- requiring a brand-new git-warp release before this slice can land

## Acceptance-Test Plan

### Checkpoint 1: Read-boundary honesty

1. `fetchEntityDetail(task:...)` no longer calls `fetchSnapshot()` internally.
2. A targeted quest detail read does not require whole-graph snapshot assembly
   to succeed.

### Checkpoint 2: Behavior preservation

3. Existing quest-detail integration coverage stays green for narrative,
   traceability, reviews, and timeline behavior.
4. Submission status semantics, including "submitter approval does not count as
   an independent approver", remain unchanged.

## Implementation Notes

- The first cut does not need to perfect every targeted helper. It needs to
  stop the biggest lie: one quest detail read should not rebuild the omnibus
  snapshot.
- Reuse existing quest/submission/traceability assembly logic where practical,
  but prefer direct subgraph reads over global snapshot dependencies.
- Narrative loading may remain broader than ideal in this slice if the
  substrate lacks a narrower primitive; call that out honestly in the retro.

## Playback Questions

1. Can a human operator inspect one quest without the application silently
   rebuilding the whole dashboard model?
2. Can an agent ask for one quest detail without reinforcing the idea that XYPH
   owns a second graph runtime?
3. Did this slice materially narrow `GraphContext`, or did it just move the
   same whole-graph habit behind a different helper?

## Exit Criteria

This cycle closes when:

- the quest-detail path no longer routes through `fetchSnapshot()`
- the boundary is pinned by executable tests
- existing quest-detail semantics remain green
- retrospective notes any remaining broad query patterns honestly instead of
  pretending the boundary is fully solved
