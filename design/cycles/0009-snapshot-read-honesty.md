# 0009: Snapshot Read Honesty

## Cycle Type

Debt-reduction / substrate-alignment follow-on

This cycle continues the read-boundary narrowing work from `0005`, `0007`, and
`0008`.
The target is bounded: stop `GraphContext` from pre-materializing the graph
before building live snapshot and entity-detail projections when those
projections already use live query, point-read, neighbor, and traversal APIs.

## Graph Anchor

- Work item: `task:snapshot-read-honesty`

## Why This Cycle Exists

The quest-detail cycles removed the most obvious whole-snapshot abuses, and the
`git-warp` `v15` migration restored honest substrate usage for derived
worldlines.

But `GraphContext` still contains one broad lie in its live read path:

- `fetchSnapshot()` does `syncCoverage()`
- then calls `materialize()`
- then builds the dashboard snapshot from live queries, neighbor reads, graph
  traversal, and point lookups

`fetchEntityDetail()` does the same thing before its targeted read path.

That pre-read `materialize()` does not define the actual read model anymore. It
only teaches the wrong habit: "before you read, rebuild a whole in-memory state
first."

Historical observation graphs are a different case. Those already materialize
at a tick ceiling in `ControlPlaneService.openObservationGraph()`. The lie is
specifically the extra pre-read materialization inside `GraphContext`'s live
snapshot/detail path.

## Sponsor Actors

### Primary sponsor actor

**Operator-Supervisor**

Needs the dashboard and detail views to read directly from substrate truth
instead of paying an invisible "whole-state first" tax before every snapshot.

### Secondary sponsor actors

**Cold-Start Worker Agent**

Needs the app to model honest read behavior so agents do not infer that
materializing a whole graph is the normal prerequisite for a dashboard read.

**Application Integrator**

Needs XYPH to keep demonstrating the boundary it expects from downstream apps:
read with query/traversal/point helpers unless a real substrate task requires
materialization explicitly.

## Outcome Hill

**As a human or agent reading the live dashboard or a live entity detail page,
I can get the projection without XYPH first materializing a whole graph state,
so the product's read model stays aligned with the substrate APIs it actually
uses.**

## Invariants

This cycle must preserve:

- The graph is the plan.
- git-warp owns substrate facts; XYPH owns meaning.
- Human and agent surfaces must share one reality.
- Live snapshot and entity-detail semantics must remain unchanged.
- Historical tick reads must remain correct and may continue to materialize in
  the dedicated historical observation path.
- This cycle narrows `GraphContext`; it does not delete the snapshot model.

## Scope

In scope:

- remove default pre-read `materialize()` from live `fetchSnapshot()`
- remove default pre-read `materialize()` from live `fetchEntityDetail()`
- simplify `GraphContext` options/callers so historical observation remains
  explicit in `ControlPlaneService`
- pin the absence of live pre-read materialization with executable spec

Out of scope:

- deleting `GraphContext`
- redesigning the dashboard snapshot shape
- removing historical tick materialization from `ControlPlaneService`
- broader dashboard-family query pruning in the same slice

## Acceptance-Test Plan

### Checkpoint 1: Live read-boundary honesty

1. `fetchSnapshot()` no longer calls `graph.materialize()` on the live read
   path.
2. `fetchEntityDetail()` no longer calls `graph.materialize()` on the live read
   path.

### Checkpoint 2: Behavior preservation

3. Existing snapshot/read-honesty and quest-detail integration behavior remains
   green.
4. Historical and derived-worldline parity coverage remains green.

### Checkpoint 3: Overall regression safety

5. `npx tsc --noEmit` passes.
6. `npm run lint` passes.
7. `npm run test:local` passes.

## Implementation Notes

- Historical `at={ tick }` reads are already isolated in
  `ControlPlaneService.openObservationGraph()`. Keep that path explicit instead
  of hiding a second materialization inside `GraphContext`.
- If a `GraphContext` caller wants a pre-shaped graph, it should hand in that
  graph directly. The context should not imply whole-state replay as the
  default live read setup.
- Preserve the frontier-based snapshot cache. Removing pre-read materialization
  must not regress same-frontier cache hits.

## Playback Questions

1. Can XYPH now explain its live dashboard read model honestly as
   sync/query/traverse/point-read instead of sync/materialize/query?
2. Did the slice remove a real boundary violation, or merely rename a helper
   without changing behavior?
3. Do historical tick reads remain explicit about when materialization is still
   required?

## Exit Criteria

This cycle closes when:

- live `GraphContext` snapshot/detail reads no longer pre-materialize
- the boundary is pinned in integration tests
- existing read semantics remain green
- the retrospective states honestly that broader snapshot-shape reduction is
  still separate follow-on work
