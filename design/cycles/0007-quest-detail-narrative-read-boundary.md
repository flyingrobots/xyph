# 0007: Quest Detail Narrative Read Boundary

## Cycle Type

Debt-reduction / substrate-alignment follow-on

This cycle continues the quest-detail read-boundary work from
`0005-quest-detail-read-boundary.md`.
The target is narrow: stop `loadNarrativeForTargets()` from scanning every
`spec:*`, `adr:*`, `note:*`, and `comment:*` node family when one quest detail
projection only needs the narrative graph reachable from a bounded set of
relevant IDs.

## Graph Anchor

- Work item: `task:quest-detail-narrative-read-boundary`

## Why This Cycle Exists

The previous cycle removed the biggest lie in the old path:
`fetchEntityDetail(task:...)` no longer calls `fetchSnapshot()`.

But quest-detail narrative loading still violates the same design boundary in a
smaller way:

- `buildQuestDetailFromGraph()` computes a bounded `relevantIds` set
- `loadNarrativeForTargets()` ignores that boundary at first
- it queries all `spec:*`, `adr:*`, `note:*`, and `comment:*` nodes globally
- then it filters back down in XYPH space

That keeps normalizing "scan a whole family, then interpret locally" as the
default application read habit. XYPH should instead seed narrative reads from
the target set and expand only along directly relevant narrative edges.

## Sponsor Actors

### Primary sponsor actor

**Operator-Supervisor**

Needs one quest detail page to load from the graph region that actually matters
to that quest, not from a hidden application-wide narrative census.

### Secondary sponsor actors

**Cold-Start Worker Agent**

Needs to inspect one quest's documents and comments without learning that
"entity detail" secretly means "enumerate all notes and comments first."

**Application Integrator**

Needs XYPH to model the boundary it expects from downstream apps: query and
traverse from relevant anchors instead of rebuilding a shadow global read
model.

## Outcome Hill

**As a human or agent inspecting one quest, I can load that quest's narrative
documents and comments by expanding from the quest's relevant graph anchors, so
the application keeps read behavior local instead of silently scanning every
narrative family.**

## Invariants

This cycle must preserve:

- The graph is the plan.
- git-warp owns substrate facts; XYPH owns meaning.
- Human and agent surfaces must share one reality.
- Existing quest-detail narrative behavior must remain semantically intact.
- Supersession chains for documents and reply chains for comments must still be
  complete once a target-attached document or comment is included.
- This cycle narrows the quest-detail read path; it does not rewrite the
  omnibus snapshot path.

## Scope

In scope:

- replace broad narrative-family scans in `loadNarrativeForTargets()`
- seed narrative reads from incoming `documents` and `comments-on` edges on the
  bounded target set
- expand only along local `supersedes` and `replies-to` edges needed to build
  the same quest-detail narrative view
- encode the read-boundary rule as executable spec

Out of scope:

- deleting `GraphContext`
- rewriting dashboard or snapshot narrative loading in the same cycle
- changing quest-detail UI shape or timeline semantics
- introducing new git-warp primitives before this slice can land

## Acceptance-Test Plan

### Checkpoint 1: Read-boundary honesty

1. `fetchEntityDetail(task:...)` no longer performs `spec:*`, `adr:*`, `note:*`,
   or `comment:*` family scans while building quest detail narrative.
2. Quest-detail narrative loading starts from the bounded relevant target set
   and expands locally through attached narrative nodes.

### Checkpoint 2: Behavior preservation

3. Existing quest-detail documents, comments, reply chains, and note revision
   chains remain green.
4. Timeline entries derived from those narrative artifacts remain unchanged.

## Implementation Notes

- Seed document IDs from incoming `documents` edges on the target set.
- Seed comment IDs from incoming `comments-on` edges on the target set.
- Expand document inclusion through `supersedes` in both directions.
- Expand comment inclusion through `replies-to` in both directions.
- Fetch props/content only for the included narrative nodes instead of scanning
  whole families first.

## Playback Questions

1. Can a human inspect one quest without XYPH silently enumerating every note,
   spec, ADR, and comment in the graph first?
2. Can an agent infer from this path that narrative reads should be anchored and
   expanded locally, not prefetched globally?
3. Did the slice remove the broad query pattern, or just move it behind a new
   helper?

## Exit Criteria

This cycle closes when:

- quest-detail narrative loading no longer scans global narrative families
- the boundary is pinned by executable tests
- existing quest-detail behavior remains green
- the retrospective states honestly whether broader snapshot narrative reads
  still carry the old pattern elsewhere
