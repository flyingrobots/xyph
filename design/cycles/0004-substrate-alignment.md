# 0004: git-warp Substrate Alignment

## Cycle Type

Architecture pivot

This cycle captures the first bounded slice in the larger alignment program
between git-warp's substrate semantics and XYPH's product semantics.

## Graph Anchor

- Work item: `task:git-warp-substrate-alignment`

## Why This Cycle Exists

The product loop, case model, and speculative-lane discussion have clarified a
boundary problem:

- git-warp already owns most of the right substrate facts
- XYPH is still rebuilding too much graph-shaped read behavior above the
  substrate
- plain `WarpGraph` usage still feels more like "mutable graph session" than
  "observer/worldline handle"

If we keep pushing deeper governance and product surfaces without correcting
that boundary, XYPH will accumulate more code that should really belong in
git-warp.

## Sponsor Actors

### Primary sponsor actor

**Application Integrator**

Needs git-warp to expose worldline, observer, and speculative-lane behavior
cleanly enough that higher-layer apps can stay thin and honest instead of
reconstructing substrate semantics in app code.

### Secondary sponsor actors

**Cold-Start Worker Agent**

Needs the agent surface to consume honest substrate-backed coordinates and
future lanes without shell archaeology or app-local projection magic.

**Operator-Supervisor**

Needs human-facing governance surfaces to stay legible because the substrate is
doing the real speculative/read-side work underneath, not a hidden XYPH-only
graph layer.

## Outcome Hill

**As an integrator building human and agent surfaces, I can rely on git-warp
for worldline-relative reads and speculative-lane mechanics, so XYPH can focus
on policy, governance, and product meaning instead of reconstructing graph
semantics above the substrate.**

## Invariants

This cycle must preserve:

- The graph is the plan.
- git-warp owns substrate facts; XYPH owns meaning.
- Human and agent surfaces must share one reality.
- XYPH must not become a second graph system above git-warp.
- Governance and policy semantics must remain above the substrate.
- Changes to git-warp must be shipped as real releases because other apps rely
  on it too.

## Scope

In scope:

- capture the substrate alignment target clearly in the design corpus
- define the first bounded git-warp slice needed to move toward that target
- shape the acceptance-test plan for a substrate-first implementation
- identify one XYPH read path that should adopt the new substrate slice first

Out of scope for this cycle:

- shipping the full intent queue plus deterministic multi-intent tick engine
- redesigning the whole TUI around worldline controls immediately
- moving governance semantics into git-warp
- treating `WarpGraph.materialize()` itself as the only abstraction that must
  change

## Acceptance-Test Plan

This cycle should stay bounded. The first executable spec should focus on the
read boundary before the full speculative write engine.

### Checkpoint 1: git-warp observer/worldline read handles

1. A caller can obtain independent read handles at two explicit coordinates
   without silently mutating one handle when the other advances.
2. An observer-relative read can target an explicit coordinate or pinned
   working set cleanly.
3. The substrate can still expose a stable frozen-state reader for immutable
   historical inspection.

### Checkpoint 2: XYPH adoption of one narrow read path

4. One XYPH read path consumes the new substrate handle/reader directly instead
   of flowing through the omnibus `GraphContext` snapshot.
5. `briefing` and `doctor` no longer rematerialize and rebuild broad snapshots
   independently for that path.

## Implementation Notes

- Treat this as a substrate release program, not an XYPH-only patch.
- The first slice should improve read semantics and handle shape before it
  tackles the larger intent/tick engine.
- Working sets are the likely substrate home for speculative future lanes.
- `GraphContext` should be narrowed over time, not deleted in one reckless cut.
- This cycle supersedes further generalization of case-driven governance above
  XYPH until the substrate boundary is cleaner.

## Playback Questions

After the first slice lands, ask:

1. Can an integrator read one historical or speculative coordinate honestly
   without building an app-local graph snapshot?
2. Can a cold-start agent inspect the same substrate truth the human surface
   sees without semantic drift?
3. Did git-warp become clearer as a substrate without absorbing XYPH ontology
   or governance language?

## Exit Criteria

This cycle closes when:

- the substrate alignment target is explicit in the corpus
- the first git-warp slice is clearly defined and acceptance-testable
- one XYPH adoption path is named and ready to switch to the new substrate
  semantics after release
- the next implementation work is clearly below the XYPH product layer rather
  than hidden inside another `GraphContext` expansion
