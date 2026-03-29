# 0014: Analysis Snapshot Profile

## Cycle Type

Debt-reduction / traceability-read narrowing follow-on

This cycle follows `0013` by introducing a narrower snapshot profile for
traceability-analysis consumers that still need legacy suggestion state.

## Graph Anchor

- Work item: `task:analysis-snapshot-profile`

## Why This Cycle Exists

After `0013`, the next obvious remaining `full` consumer was:

- `analyze`

That command needs:

- requirements
- criteria
- linked evidence
- legacy suggestions

It does **not** need:

- stories
- policies
- campaign or quest completion rollups
- the broader `full` summary census

While reviewing that path, we also found that `0013` had overreached:
`operational` intentionally excludes legacy `snapshot.suggestions`, so routing
`suggestion accept-all` there was semantically wrong even though the mocked unit
test still passed.

This cycle introduces an explicit `analysis` snapshot profile that preserves the
traceability data these consumers actually need without falling back to the
broad `full` compatibility path.

## Sponsor Actors

### Primary sponsor actor

**Operator-Supervisor**

Needs test-analysis and legacy suggestion workflows to read only the
traceability state they actually use instead of silently paying for the full
snapshot census.

### Secondary sponsor actors

**Automation Agent**

Needs `analyze` and batch suggestion acceptance to remain substrate-honest and
cheap without rebuilding traceability reads ad hoc in each command.

## Outcome Hill

**As an operator or automation agent running traceability analysis workflows, I
can read requirements, criteria, evidence, and legacy suggestions through a
narrow analysis snapshot profile instead of the broad full snapshot path.**

## Invariants

This cycle must preserve:

- The graph is the plan.
- git-warp owns substrate facts; XYPH owns meaning.
- `analyze` still sees requirements, criteria, existing linked evidence, and
  rejected legacy suggestions.
- `suggestion accept-all` still sees pending legacy suggestions.
- This slice narrows reads; it does not redesign suggestion or analysis
  semantics.

## Scope

In scope:

- add `profile: 'analysis'` to `GraphContext`
- ensure that profile includes requirements, criteria, evidence, and legacy
  suggestions
- ensure that profile excludes stories, policies, and completion rollups
- route `analyze` and `suggestion accept-all` to the new profile
- pin the profile in focused unit coverage

Out of scope:

- doctor or control-plane summary narrowing
- redesign of traceability completion logic
- replacement of the legacy suggestion model

## Acceptance-Test Plan

### Checkpoint 1: Analysis profile shape

1. `fetchSnapshot(..., { profile: 'analysis' })` queries requirements,
   criteria, evidence, and suggestions
2. It does not query stories or policies
3. It preserves legacy `snapshot.suggestions`

### Checkpoint 2: Consumer routing

4. `analyze` requests `profile: 'analysis'`
5. `suggestion accept-all` requests `profile: 'analysis'`

### Checkpoint 3: Overall regression safety

6. `npx tsc --noEmit` passes
7. focused CLI + graph-context unit coverage passes
8. `npm run lint` passes
9. the push hook suite stays green

## Implementation Notes

- Keep this slice profile-based instead of adding bespoke one-off read helpers.
- The new profile is intentionally narrow and named for the concrete consumer
  family it serves.
- `0014` also corrects the legacy suggestion routing mistake introduced in
  `0013`.

## Playback Questions

1. Did `analysis` become the honest middle ground between `operational` and
   `full`?
2. Did the slice correct the `0013` legacy-suggestion mismatch without widening
   into doctor or control-plane redesign?

## Exit Criteria

This cycle closes when:

- `GraphContext` supports `analysis`
- `analyze` and `suggestion accept-all` use it
- focused tests pin the profile shape and command routing
- the retrospective records the remaining `full` consumers honestly
