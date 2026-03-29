# 0013: Suggestion Operational Snapshot Profile

## Cycle Type

Debt-reduction / legacy CLI consumer narrowing follow-on

This cycle follows `0012` by moving the legacy batch suggestion acceptance path
off the full snapshot compatibility surface.

## Graph Anchor

- Work item: `task:suggestion-operational-snapshot-profile`

## Why This Cycle Exists

After `0012`, one of the cleanest remaining `full` snapshot consumers was the
legacy CLI command:

- `suggestion accept-all`

That path still defaulted to the full snapshot even though it only needs:

- `snapshot.suggestions`
- confidence filtering
- suggestion target metadata already present on suggestion nodes

It does not need the full traceability census or completion rollups. Keeping it
on the broad compatibility path teaches the wrong read model and makes a simple
batch acceptance command pay for unrelated graph assembly.

This cycle narrows that command to the operational snapshot profile and pins the
choice with a focused CLI unit test.

## Sponsor Actors

### Primary sponsor actor

**Operator-Supervisor**

Needs batch suggestion acceptance to stay cheap and explicit instead of
silently inheriting the broad full-snapshot cost model.

### Secondary sponsor actors

**Automation Agent**

Needs the legacy suggestion acceptance path to align with the operational read
model already used by dashboard, wizard, and agent workflow surfaces.

## Outcome Hill

**As an operator or automation agent batch-accepting pending suggestions, I can
read suggestion candidates through the operational snapshot profile instead of
the full snapshot compatibility surface.**

## Invariants

This cycle must preserve:

- The graph is the plan.
- git-warp owns substrate facts; XYPH owns meaning.
- `suggestion accept-all` still filters pending suggestions by confidence and
  writes the same linked evidence patches.
- This slice narrows one legacy consumer; it does not redesign suggestion
  semantics.

## Scope

In scope:

- route `suggestion accept-all` to `profile: 'operational'`
- pin that routing in CLI unit coverage

Out of scope:

- analyze, doctor, or control-plane snapshot narrowing
- redesign of `snapshot.suggestions`
- broader suggestion lifecycle changes

## Acceptance-Test Plan

### Checkpoint 1: Suggestion CLI routing

1. `suggestion accept-all` requests `profile: 'operational'`
2. The command still accepts pending suggestions and writes linked evidence

### Checkpoint 2: Overall regression safety

3. `npx tsc --noEmit` passes
4. focused suggestion unit coverage passes
5. `npm run lint` passes
6. `npm run test:local` passes if the suite remains within current timeout
   pressure

## Implementation Notes

- Keep this slice narrow: one legacy command, one focused spec, no suggestion
  model redesign.
- Reuse the existing suggestion command test rather than introducing a new
  helper-only test.

## Playback Questions

1. Did `suggestion accept-all` stop defaulting to the full snapshot?
2. Did the slice stay bounded to the legacy batch command instead of turning
   into a broader suggestion refactor?

## Exit Criteria

This cycle closes when:

- `suggestion accept-all` uses `operational`
- a unit test pins that routing explicitly
- the retrospective records the remaining `full` consumers honestly
