# 0012: Wizard Operational Snapshot Profile

## Cycle Type

Debt-reduction / helper-read narrowing follow-on

This cycle follows `0011` by moving the shared interactive wizard snapshot
helper onto the narrower operational profile.

## Graph Anchor

- Work item: `task:wizard-operational-snapshot-profile`

## Why This Cycle Exists

After `0011`, the remaining full-snapshot consumers were smaller and more
explicit. One of the cleanest remaining families was the interactive wizard
surface:

- `quest-wizard`
- `review-wizard`
- `promote-wizard`
- `triage`

All of those commands share one helper:

- `fetchWizardSnapshot()`

And that helper was still defaulting to the full snapshot even though wizard
flows only need operational workflow data such as:

- quests
- campaigns
- intents
- submissions

They do not need the full traceability census or completion rollups.

This cycle narrows that helper so the entire wizard family reads through the
operational profile.

## Sponsor Actors

### Primary sponsor actor

**Operator-Supervisor**

Needs interactive workflow helpers to stay cheap and truthful rather than
silently inheriting the broad full snapshot cost model.

### Secondary sponsor actors

**Interactive Human Worker**

Needs wizard flows to reflect the same operational read model already used by
the dashboard, agent services, and operational CLI status views.

## Outcome Hill

**As a human using the interactive CLI wizards, I can read the workflow data I
need through the operational snapshot profile instead of the full snapshot
compatibility surface.**

## Invariants

This cycle must preserve:

- The graph is the plan.
- git-warp owns substrate facts; XYPH owns meaning.
- Wizard flows continue to work with the same operational quest/campaign/intent
  and submission data they used before.
- This slice narrows the shared helper; it does not redesign wizard UX.

## Scope

In scope:

- route `fetchWizardSnapshot()` to `profile: 'operational'`
- add unit coverage that pins the profile choice through a real wizard command

Out of scope:

- analyze, doctor, or control-plane snapshot narrowing
- suggestion accept-all and legacy `snapshot.suggestions`
- wizard UX redesign

## Acceptance-Test Plan

### Checkpoint 1: Wizard helper routing

1. The shared wizard snapshot helper requests `profile: 'operational'`
2. A real interactive wizard path still works against the mocked command flow

### Checkpoint 2: Overall regression safety

3. `npx tsc --noEmit` passes
4. focused wizard unit coverage passes
5. `npm run lint` passes
6. `npm run test:local` passes

## Implementation Notes

- Pin the profile through `review-wizard`, because it exercises the shared
  helper without requiring a large graph-mutation setup.
- Keep this slice narrow: one helper family, one focused spec, no extra CLI
  churn.

## Playback Questions

1. Did the shared wizard helper stop defaulting to the full snapshot?
2. Did the slice stay bounded to wizard helper reads instead of broad CLI
  redesign?

## Exit Criteria

This cycle closes when:

- `fetchWizardSnapshot()` uses `operational`
- a unit test pins that behavior through a real wizard command path
- the retrospective records the remaining non-wizard full consumers honestly
