# 0008: git-warp v15 Surface Migration

## Cycle Type

Compatibility / substrate-alignment follow-on

This cycle continues the substrate-alignment program after
`0004-substrate-alignment.md`.
The target is bounded on purpose: adopt the released `@git-stunts/git-warp`
`15.x` surface in XYPH without restoring the old flat-runtime misuse pattern,
and make canonical derived-worldline reads observe actual strand truth instead
of silently falling back to live graph truth.

## Graph Anchor

- Work item: `task:git-warp-v15-surface-migration`

## Why This Cycle Exists

XYPH depended on the older flat `git-warp` surface where one root graph handle
mixed product and substrate capabilities together.

`git-warp` `v15` made the split explicit:

- `WarpApp` is the product-facing root
- `WarpCore` is the substrate/plumbing root
- `working set` became `strand`

That release is the substrate XYPH is meant to consume. XYPH therefore needs
to stop pretending the old surface still exists.

The migration is not only about compilation:

- XYPH has several services that intentionally perform substrate work
  (`materialize`, patch provenance, coordinate comparison, strand operations)
- those paths should type against the substrate root honestly
- derived worldline reads must not compile by cheating and then read live truth
  at runtime

If this cycle lands badly, XYPH either stays pinned to the old package, or it
adopts `v15` while continuing to hide boundary violations under compatibility
shims.

## Sponsor Actors

### Primary sponsor actor

**Application Integrator**

Needs XYPH to consume the released `git-warp` surface honestly, so the product
does not fork its own private substrate dialect or depend on unpublished local
patches.

### Secondary sponsor actors

**Cold-Start Worker Agent**

Needs the product's worldline reads, diffs, and governance previews to keep
observing one coherent reality after the substrate upgrade.

**Operator-Supervisor**

Needs derived worldline summaries, detail pages, and conflict analysis to
continue reflecting actual worldline state rather than a live-graph shadow.

## Outcome Hill

**As a human or agent using XYPH on the released `git-warp` `v15` package, I
can keep reading, comparing, and mutating governed worldlines without the app
depending on removed substrate nouns or silently reading live truth when a
derived strand was requested.**

## Invariants

This cycle must preserve:

- The graph is the plan.
- XYPH must consume published substrate releases, not local one-off patches.
- git-warp owns substrate facts; XYPH owns meaning.
- Human and agent surfaces must share one reality.
- Derived worldline reads must remain internally consistent across summary,
  detail, diff, and conflict flows.
- Public `git-warp` noun changes must not leave XYPH speaking the old
  substrate dialect in active code paths.

## Scope

In scope:

- upgrade XYPH to published `@git-stunts/git-warp` `^15.0.1`
- retarget XYPH's substrate-heavy graph root typing to the `WarpCore` surface
- replace removed `working set` substrate calls/selectors/errors with `strand`
  equivalents
- repair derived-worldline graph contexts so they read the selected strand via
  a worldline-backed facade instead of live truth
- keep the existing read-boundary and parity suites green under the new
  substrate surface

Out of scope:

- rewriting all XYPH graph consumers around `WarpApp`
- deleting `GraphContext`
- redesigning XYPH worldline UX or governance semantics
- introducing new product features in the same slice

## Acceptance-Test Plan

### Checkpoint 1: Published substrate compatibility

1. `npx tsc --noEmit` passes against `@git-stunts/git-warp` `^15.0.1`.
2. XYPH no longer calls removed `working set` substrate APIs.

### Checkpoint 2: Derived-worldline honesty

3. Canonical derived-worldline parity coverage stays green under the migrated
   substrate surface.
4. Quest-detail and read-honesty integration coverage remains green when the
   graph root is retargeted to the `WarpCore` split.

### Checkpoint 3: Overall regression safety

5. `npm run lint` passes.
6. `npm run test:local` passes.

## Implementation Notes

- This cycle does not treat `WarpCore` as a philosophical failure. XYPH
  already performs genuine substrate work, so those paths should say so
  directly instead of pretending they are normal app reads.
- The derived-worldline fix should use a strand-backed `worldline()` facade for
  read operations that feed `GraphContext`, rather than rebuilding a shadow app
  state or reading live truth accidentally.
- Keep the migration bounded: adapt the existing architecture to the released
  substrate split instead of trying to redesign every graph consumer in one
  sweep.

## Playback Questions

1. Can XYPH now consume the released `git-warp` `v15` package without local
   compatibility hacks?
2. Do derived worldline reads now reflect the requested strand consistently
   across summary, detail, diff, and conflict surfaces?
3. Did this slice make the substrate boundary more honest, or did it only
   rename types while preserving the same hidden lies?

## Exit Criteria

This cycle closes when:

- XYPH builds and tests cleanly against published `git-warp` `15.x`
- removed `working set` substrate calls are gone from active XYPH code paths
- derived-worldline reads are pinned to strand-backed worldline truth
- the retrospective records any remaining broader `WarpApp` / `WarpCore`
  cleanup honestly instead of pretending the migration finished the whole
  substrate-alignment program
