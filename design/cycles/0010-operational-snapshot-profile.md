# 0010: Operational Snapshot Profile

## Cycle Type

Debt-reduction / read-boundary narrowing follow-on

This cycle follows `0009` by shrinking the live snapshot cost model instead of
only removing the explicit pre-read materialization lie.

## Graph Anchor

- Work item: `task:operational-snapshot-profile`

## Why This Cycle Exists

`0009` made live reads more honest by removing default pre-read
`materialize()`.

But `GraphContext.fetchSnapshot()` still pays one broad census cost for all
callers:

- dashboard reads
- agent briefing/context/action reads
- doctor/analyze/operator reads

Those surfaces do not all need the same projection.

The hot operational path mostly needs:

- quests
- campaigns
- submissions
- reviews
- decisions
- governance artifacts
- AI suggestions
- case links

It does not need the full traceability family census on every live refresh:

- `story:*`
- `req:*`
- `criterion:*`
- `evidence:*`
- `policy:*`

This cycle introduces an explicit operational snapshot profile so XYPH can stop
charging dashboard and agent reads for traceability assembly they do not use,
while preserving the full snapshot for diagnostic and traceability-heavy
surfaces.

## Sponsor Actors

### Primary sponsor actor

**Operator-Supervisor**

Needs the dashboard and cockpit reads to stay responsive without paying for
traceability rollups that are irrelevant to the operational worklist.

### Secondary sponsor actors

**Cold-Start Worker Agent**

Needs briefing and context assembly to read the graph through the narrowest
truthful projection instead of inheriting the full dashboard census by default.

**Traceability Steward**

Still needs the full snapshot for doctor/analyze and deeper traceability
surfaces. This cycle must not lie by pretending those reads no longer need
full census data.

## Outcome Hill

**As a dashboard operator or agent reading live work state, I can fetch an
operational snapshot that omits unused traceability-family census while still
preserving suggestion, case, governance, and quest semantics.**

## Invariants

This cycle must preserve:

- The graph is the plan.
- git-warp owns substrate facts; XYPH owns meaning.
- Human and agent surfaces must share one reality.
- `fetchSnapshot()` defaults to full truth-preserving behavior unless a caller
  explicitly opts into the operational profile.
- Operational snapshots must preserve AI suggestion to case linking.
- Full snapshots must preserve traceability families and computed completion.
- This cycle narrows hot reads; it does not delete the snapshot model.

## Scope

In scope:

- add explicit snapshot profiles to `GraphContext.fetchSnapshot()`
- keep `full` as the existing default behavior
- add an `operational` profile that skips traceability-family census and
  completion rollups
- move dashboard and agent hot paths to the `operational` profile
- pin the boundary in executable tests

Out of scope:

- deleting `GraphContext`
- redesigning `GraphSnapshot`
- removing full snapshot support from doctor/analyze/operator surfaces
- changing targeted entity-detail behavior in the same slice

## Acceptance-Test Plan

### Checkpoint 1: Profile boundary

1. `fetchSnapshot(..., { profile: 'operational' })` does not query
   `story:*`, `req:*`, `criterion:*`, `evidence:*`, or `policy:*`.
2. `fetchSnapshot(..., { profile: 'full' })` remains the default and continues
   to expose the traceability families.

### Checkpoint 2: Operational behavior preservation

3. Operational snapshots still populate AI suggestion to case links.
4. Dashboard and agent callers read through the operational profile without
   changing their current behavior.

### Checkpoint 3: Overall regression safety

5. `npx tsc --noEmit` passes.
6. `npm run lint` passes.
7. Focused read-boundary tests pass.
8. `npm run test:local` passes.

## Implementation Notes

- Keep per-frontier caching honest by caching snapshots by profile instead of
  pretending one broad cached snapshot serves every use case.
- Operational profile still needs `case:*` census because suggestion UI and
  cockpit surfaces use linked case status.
- This slice intentionally leaves doctor, CLI dashboard/status, and
  traceability-heavy paths on the full snapshot until a later cycle proves they
  can move safely.

## Playback Questions

1. Did the hot operational callers stop paying for unused traceability census?
2. Did the slice preserve linked case and governance semantics in operational
   views?
3. Did the default snapshot behavior remain full and honest for deeper
   diagnostic surfaces?

## Exit Criteria

This cycle closes when:

- `GraphContext` supports explicit `full` and `operational` snapshot profiles
- hot dashboard and agent callers use `operational`
- executable tests pin the skipped traceability families and preserved case
  linking
- the retrospective states honestly that broader snapshot deletion is still
  separate follow-on work
