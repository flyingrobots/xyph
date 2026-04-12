# 0004: git-warp Bedrock Alignment

## Cycle Type

Architecture pivot

This cycle captures the first bounded slice in the larger alignment program
between git-warp's bedrock semantics and XYPH's product semantics.

## Graph Anchor

- Work item: `task:git-warp-bedrock-alignment`

## Why This Cycle Exists

The product loop, case model, and speculative-lane discussion have clarified a
boundary problem:

- git-warp already owns most of the right bedrock facts
- XYPH is still rebuilding too much graph-shaped read behavior above the
  bedrock
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
reconstructing bedrock semantics in app code.

### Secondary sponsor actors

**Cold-Start Worker Agent**

Needs the agent surface to consume honest bedrock-backed coordinates and
future lanes without shell archaeology or app-local projection magic.

**Operator-Supervisor**

Needs human-facing governance surfaces to stay legible because the bedrock is
doing the real speculative/read-side work underneath, not a hidden XYPH-only
graph layer.

## Outcome Hill

**As an integrator building human and agent surfaces, I can rely on git-warp
for worldline-relative reads and speculative-lane mechanics, so XYPH can focus
on policy, governance, and product meaning instead of reconstructing graph
semantics above the bedrock.**

## Invariants

This cycle must preserve:

- The graph is the plan.
- git-warp owns bedrock facts; XYPH owns meaning.
- Human and agent surfaces must share one reality.
- XYPH must not become a second graph system above git-warp.
- Governance and policy semantics must remain above the bedrock.
- Changes to git-warp must be shipped as real releases because other apps rely
  on it too.

## Scope

In scope:

- capture the bedrock alignment target clearly in the design corpus
- define the first bounded git-warp slice needed to move toward that target
- shape the acceptance-test plan for a bedrock-first implementation
- identify one XYPH read path that should adopt the new bedrock slice first

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
3. The bedrock can still expose a stable frozen-state reader for immutable
   historical inspection.

### Checkpoint 2: XYPH adoption of one narrow read path

4. One XYPH read path consumes the new bedrock handle/reader directly instead
   of flowing through the omnibus `GraphContext` snapshot.
5. `briefing` and `doctor` no longer rematerialize and rebuild broad snapshots
   independently for that path.

## Implementation Notes

- Treat this as a bedrock release program, not an XYPH-only patch.
- The first slice should improve read semantics and handle shape before it
  tackles the larger intent/tick engine.
- Working sets are the likely bedrock home for speculative future lanes.
- `GraphContext` should be narrowed over time, not deleted in one reckless cut.
- This cycle supersedes further generalization of case-driven governance above
  XYPH until the bedrock boundary is cleaner.

## Playback Questions

After the first slice lands, ask:

1. Can an integrator read one historical or speculative coordinate honestly
   without building an app-local graph snapshot?
2. Can a cold-start agent inspect the same bedrock truth the human surface
   sees without semantic drift?
3. Did git-warp become clearer as a bedrock without absorbing XYPH ontology
   or governance language?

## Exit Criteria

This cycle closes when:

- the bedrock alignment target is explicit in the corpus
- the first git-warp slice is clearly defined and acceptance-testable
- one XYPH adoption path is named and ready to switch to the new bedrock
  semantics after release
- the next implementation work is clearly below the XYPH product layer rather
  than hidden inside another `GraphContext` expansion
