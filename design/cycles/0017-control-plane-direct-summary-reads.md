# 0017: Control-Plane Direct Summary Reads

## Cycle Type

Implementation follow-on for `0016`

This cycle follows the `0016` design decision by removing control-plane
summary from the snapshot compatibility surface.

## Graph Anchor

- Work item: `task:control-plane-direct-summary-reads`

## Why This Cycle Exists

`0016` settled the semantics:

- `graph.summary` is an orientation projection
- `worldline.summary` is an orientation projection
- neither should be treated as a snapshot profile

But after `0016`, the implementation still routed summary through
`graphCtx.fetchSnapshot()`, which meant even a thin counts-only projection paid
for:

- broad family queries
- model assembly
- traceability completion work
- suggestion shaping

This cycle implements the designed boundary by giving summary a direct read
path.

## Sponsor Actors

### Primary sponsor actor

**Operator-Supervisor**

Needs a cheap, parity-honest orientation record for live and derived
worldlines.

### Secondary sponsor actor

**Cold-Start Worker Agent**

Needs fast counts plus graph metadata without dragging in unrelated snapshot
assembly.

## Outcome Hill

**As an operator or worker agent requesting summary, I get counts and graph
metadata directly from the selected graph/worldline handle without going
through `fetchSnapshot()`.**

## Invariants

This cycle must preserve:

- The graph is the plan.
- derived-worldline parity across summary/detail/history/diff/conflicts
- historical `at: { tick }` support for summary
- current summary wire shape: `projection`, `at`, `asOf`, `counts`,
  `graphMeta`

## Scope

In scope:

- add a direct summary helper in `ControlPlaneService`
- compute family counts with aggregate queries over the selected graph handle
- compute `graphMeta` directly from `getStateSnapshot()` + `getFrontier()`
- keep summary out of `GraphContext.fetchSnapshot()`
- pin that summary no longer calls `fetchSnapshot()` in unit tests

Out of scope:

- protocol redesign beyond the current summary payload
- deeper cleanup of derived-worldline helper internals
- broader `GraphContext` surgery

## Acceptance-Test Plan

### Checkpoint 1: Live summary honesty

1. `observe(graph.summary)` no longer calls `fetchSnapshot()`
2. It still returns counts, `graphMeta`, and observation metadata
3. It now includes `approvals` in the count census

### Checkpoint 2: Derived and historical parity

4. `observe(worldline.summary)` still reads through the derived worldline
   backing and preserves parity
5. `observe(graph.summary, at: { tick })` still routes through an isolated
   historical graph and does not call `fetchSnapshot()`

### Checkpoint 3: Regression safety

6. `npx tsc --noEmit` passes
7. focused control-plane unit + parity integration tests pass
8. `npm run lint` passes
9. the push hook suite stays green

## Implementation Notes

- Keep the count census conservative by preserving the existing keys and
  adding `approvals`, but compute them cheaply with `aggregate({ count: true
  })`.
- Preserve derived-worldline summary parity by counting through the selected
  derived graph handle instead of the live singleton.

## Playback Questions

1. Did summary fully exit the snapshot compatibility path?
2. Did the implementation preserve derived-worldline parity?
3. Did we improve honesty without widening protocol churn?

## Exit Criteria

This cycle closes when:

- summary no longer depends on `fetchSnapshot()`
- unit tests pin that boundary explicitly
- parity integration remains green
- the retrospective records whether any raw `full` summary dependency remains
