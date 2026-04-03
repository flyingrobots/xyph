# Graph Trust Repair Session

This document defines a bounded IBM Design Thinking style session for one
immediate problem:

- XYPH's graph truth has drifted away from XYPH's current schema, readiness
  rules, and governance semantics

The purpose is not to brainstorm new features.

The purpose is to decide what graph truth is canonical now, what legacy graph
patterns are still tolerated, what must be repaired, and what must be retired
before XYPH can honestly be treated as "the plan" again.

## Why This Exists

As of 2026-03-29, XYPH's own health surfaces report substantial graph drift:

- 1 blocking structural issue
- 96 readiness gaps
- 46 governed-completion gaps

That does not mean the graph is unrecoverable.

It does mean we should not jump straight into ad hoc repair or new feature work
without first aligning on:

- the current ontology
- the allowed legacy compatibility surface
- the repair rules
- the exit criteria for trustworthy dogfooding

This session is a doctrine and playback artifact, not a new cycle note.

Per [`/Users/james/git/xyph/CONTRIBUTING.md`](../CONTRIBUTING.md), backlog
reconciliation comes before the next cycle note.

## Governing Inputs

Use these sources during the session, in this order:

1. [`/Users/james/git/xyph/docs/plans/sovereign-ontology-current.md`](../docs/plans/sovereign-ontology-current.md)
2. [`/Users/james/git/xyph/docs/canonical/GRAPH_SCHEMA.md`](../docs/canonical/GRAPH_SCHEMA.md)
3. [`/Users/james/git/xyph/docs/canonical/ROADMAP_PROTOCOL.md`](../docs/canonical/ROADMAP_PROTOCOL.md)
4. [`/Users/james/git/xyph/design/README.md`](./README.md)
5. [`/Users/james/git/xyph/design/invariants.md`](./invariants.md)
6. [`/Users/james/git/xyph/design/playbacks.md`](./playbacks.md)
7. live graph diagnostics from `xyph doctor`, `xyph doctor prescribe`,
   `xyph briefing`, and `xyph status --view roadmap`

If older docs disagree with the active plan or canonical docs, the active plan
and canonical docs win.

## Session Type

This is an IBM-style Observe / Reflect / Make session adapted to XYPH.

### Observe

Study the graph as it actually exists today:

- doctor findings
- representative broken nodes
- representative quests that fail readiness
- representative governed quests that cannot compute honest completion
- examples of shipped work that still reads as backlog drift

### Reflect

Decide where the current graph is violating:

- the current schema
- the roadmap protocol
- the graph-is-the-plan invariant
- the shared human/agent reality rule

### Make

Choose the smallest repair program that restores trustworthy operation without
inventing a second hidden workflow or a compatibility folklore layer.

## Sponsor Actors

The session should explicitly judge outcomes for both lenses.

### Human sponsor actor

A maintainer or operator needs to trust that:

- roadmap state is honest
- governance status is not lying
- shipped work does not stay stranded in backlog forever
- they can tell whether the graph needs repair before using it operationally

### Agent sponsor actor

A cold-start agent needs to trust that:

- `briefing`, `next`, `context`, and `doctor` describe one coherent reality
- readiness failures are meaningful, not arbitrary legacy noise
- the graph can be repaired through lawful graph-native mutations
- it is not expected to reconstruct missing doctrine from chat memory

## Hills Under Test

This session is primarily testing two existing hills:

- Hill 2: move from awareness to lawful action without context loss
- Hill 6: let agents start productive without shell archaeology

There is also a temporary repair-specific outcome to judge:

- XYPH can distinguish "healthy enough to dogfood normally" from
  "repair mode only" honestly and deterministically

## Non-Negotiable Invariants

The session does not get to relax these:

- the graph is the plan
- humans and agents share one reality
- provenance must stay inspectable
- governance is first-class
- git-warp owns substrate facts; XYPH owns meaning

If a proposed repair strategy violates one of those, reject it.

## Agenda

Use this order.

### 1. Frame the question

Answer these first:

- What does "trustworthy graph" mean for XYPH right now?
- What decisions are blocked until the graph is trustworthy again?
- What exact dogfooding mode are we judging: read-only inspection, repair-mode,
  or normal operational use?

### 2. Review the canonical ontology

Read the active definitions for:

- node families and prefixes
- edge meanings
- readiness contract
- governed completion semantics
- legacy compatibility rules, if any

The output should be a short statement:

- "These are the graph patterns XYPH considers canonical today."

### 3. Inspect the current damage

Walk through examples from the live graph:

- one structural blocker
- two or three readiness-gap quests
- two or three governed-completion-gap quests
- one backlog drift example from recently merged work

The goal is not a full census in the room.
The goal is to identify the dominant failure classes.

### 4. Classify failure modes

For each observed pattern, decide which bucket it belongs to:

- true graph corruption
- schema drift from old dogfooding
- backlog closeout drift
- missing traceability packet
- missing evidence / completion linkage
- obsolete entity shape that should be retired, not repaired

### 5. Decide the repair policy

For each failure bucket, pick one of these actions:

- repair in place
- migrate to the new canonical shape
- retire to graveyard
- tolerate temporarily with an explicit compatibility rule
- ignore for now because it does not block truthful operation

No bucket should leave the session without a chosen policy.

### 6. Define dogfood gates

Decide the minimum graph-health bar for each operating mode.

Suggested modes:

- `inspect-only`
- `repair-mode`
- `normal-mode`

For each mode, define:

- which blocking issues are acceptable
- whether readiness gaps are tolerated
- whether governed-completion gaps are tolerated
- whether new work may be planned or merged through XYPH

### 7. Define the first repair slice

Choose the first bounded repair slice only after the above decisions exist.

That slice should name:

- the dominant repair bucket it addresses
- the first representative nodes or quests to fix
- the acceptance tests or playback that prove it helped

## Core Questions

These are the questions the session must answer.

1. Which graph entities and edges are canonical now?
2. Which legacy graph shapes are still accepted on read?
3. Which legacy graph shapes must be migrated or retired?
4. Is a quest without a packet still considered meaningful planning truth?
5. Is a governed quest without computed completion still acceptable backlog
   truth, or only transitional debt?
6. What should happen when implementation ships but backlog state is not
   reconciled?
7. What graph-health thresholds must be met before XYPH is used as normal
   operational truth again?

## Working Decision: Schema Versioning

This session starts with one provisional doctrine decision already agreed:

- XYPH should keep an explicitly versioned canonical graph schema
- XYPH should likely record one graph-level schema version marker for the live
  graph
- XYPH should not add per-node or per-edge schema version properties by default
- individual node families should carry payload-version fields only when their
  attached structured content actually has an independent compatibility story

Why:

- the current pain is primarily ontology drift, missing packets, missing edges,
  and backlog-reconciliation failure
- stamping every node and edge with a version would add noise without repairing
  the real problem
- graph-level schema versioning plus an explicit compatibility policy is enough
  to define canonical truth and legacy tolerance for the first repair program

This is still a provisional decision until the session closes, but the burden
of proof should now be on any heavier per-node/per-edge versioning scheme.

## Decision Template

Fill this in during or immediately after the session.

### A. Canonical truth

- Canonical ontology:
- Allowed legacy compatibility:
- Explicitly rejected legacy shapes:

### B. Repair policy

- Structural blockers:
- Readiness gaps:
- Governed completion gaps:
- Backlog drift after merges:
- Obsolete entities:

### C. Operating modes

- Inspect-only:
- Repair-mode:
- Normal-mode:

### D. Dogfood gate

- XYPH is safe for inspect-only when:
- XYPH is safe for repair-mode when:
- XYPH is safe for normal-mode when:

### E. First slice

- First repair slice:
- Why this slice first:
- Acceptance test or playback:
- Expected graph-health delta:

## Playback Questions

At the end of the session, answer these explicitly.

### Human lens

- Can a maintainer tell whether the graph is trustworthy enough to act on?
- Can they distinguish broken legacy state from current canonical truth?
- Is the repair policy understandable without reading implementation code?

### Agent lens

- Can an agent tell whether it should inspect, repair, or avoid normal work?
- Can it repair the graph through lawful commands rather than ad hoc surgery?
- Do `doctor`, `briefing`, and roadmap views describe the same truth?

## Expected Outputs

This session should produce all of the following:

1. a short doctrine statement about canonical graph truth
2. a repair policy for each major failure bucket
3. explicit dogfood gates for inspect-only, repair-mode, and normal-mode
4. a first bounded repair slice
5. backlog items for any follow-on repair work discovered during discussion

If the session does not produce those, it was discussion, not design.

## Explicit Non-Goals

This session is not for:

- redesigning the whole product
- inventing new governance abstractions
- broad feature ideation
- arguing from old branch names or folklore instead of canonical docs
- silently normalizing broken graph truth just to reduce friction

## Exit Rule

Do not start the next implementation slice until this session yields a repair
policy that can be turned into:

- graph mutations
- acceptance tests
- and a measurable graph-health improvement

Otherwise we are just doing smarter chaos.
