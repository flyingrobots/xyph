# 0011: CLI Operational Snapshot Profiles

## Cycle Type

Debt-reduction / consumer-boundary narrowing follow-on

This cycle follows `0010` by moving another bounded family of remaining
full-snapshot consumers onto the narrower operational read profile.

## Graph Anchor

- Work item: `task:cli-operational-snapshot-profiles`

## Why This Cycle Exists

`0010` introduced explicit `full` and `operational` snapshot profiles and moved
the dashboard app plus agent briefing/context/action services onto the narrower
operational path.

But two operational consumer families still defaulted to the broad full
snapshot:

- CLI `status` views like `roadmap`, `lineage`, `inbox`, `submissions`, and
  `deps`
- `AgentSubmissionService`, which only needs quests, submissions, reviews, and
  decisions

Those consumers do not need traceability-family census or completion rollups,
yet they were still paying for them by using the full snapshot path.

This cycle narrows those specific consumers while preserving the places that
truly still need `full`, such as:

- `status --view trace`
- `status --view suggestions`
- `status --view all`
- doctor/analyze/traceability-heavy services

## Sponsor Actors

### Primary sponsor actor

**Operator-Supervisor**

Needs operational CLI status views to stay cheap and truthful rather than
dragging the full traceability census through basic workflow reads.

### Secondary sponsor actors

**Worker Agent**

Needs submission queue reads to use the narrow operational model because they
are workflow-oriented, not traceability-oriented.

**Traceability Steward**

Still needs trace and exhaustive status views to remain on the full snapshot.

## Outcome Hill

**As an operator using CLI workflow/status surfaces or an agent reading
submission queues, I can read through the operational snapshot profile by
default while the trace-heavy views remain explicitly full.**

## Invariants

This cycle must preserve:

- The graph is the plan.
- git-warp owns substrate facts; XYPH owns meaning.
- Human and agent surfaces must share one reality.
- CLI trace/suggestions/all views remain on the full snapshot.
- CLI roadmap/lineage/inbox/submissions/deps views move to the operational
  snapshot.
- `AgentSubmissionService` uses the operational snapshot.
- This cycle narrows consumers; it does not redesign the CLI output models.

## Scope

In scope:

- route operational `status` views to `fetchSnapshot(..., { profile: 'operational' })`
- keep trace/suggestions/all on `full`
- route `AgentSubmissionService` to `operational`
- pin these profile choices in unit tests

Out of scope:

- doctor/analyze consumer narrowing
- wizard read-path changes
- suggestion accept-all changes
- deleting the full snapshot path

## Acceptance-Test Plan

### Checkpoint 1: CLI status profile routing

1. `status --view trace` requests `profile: 'full'`
2. `status --view roadmap` requests `profile: 'operational'`

### Checkpoint 2: Submission queue routing

3. `AgentSubmissionService.list()` requests `profile: 'operational'`

### Checkpoint 3: Overall regression safety

4. `npx tsc --noEmit` passes
5. focused unit coverage passes
6. `npm run lint` passes
7. `npm run test:local` passes

## Implementation Notes

- Keep the profile selection near the `status` command so view-to-profile
  mapping stays explicit instead of getting buried in `GraphContext`.
- Do not move `trace`, `suggestions`, or `all` off `full`; those views are
  exactly where the broad census is still honest.
- Submission queues are a pure workflow read, so they should align with the
  same operational profile already used by agent briefing/context/action.

## Playback Questions

1. Did operational CLI status views stop paying the full traceability census?
2. Did trace-heavy CLI views remain explicitly full?
3. Did submission queues align with the narrower operational model?

## Exit Criteria

This cycle closes when:

- CLI status views are explicitly split between `operational` and `full`
- `AgentSubmissionService` uses `operational`
- unit tests pin the routing choices
- the retrospective records which remaining full consumers are still untouched
