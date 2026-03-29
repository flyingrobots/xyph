# 0018: Dashboard Trace and Suggestion Profiles

## Cycle Type

Debt-reduction / dashboard profile narrowing follow-on

This cycle follows `0017` by shrinking the remaining obvious dashboard uses of
the raw `full` snapshot profile.

## Graph Anchor

- Work item: `task:dashboard-trace-and-suggestion-profiles`

## Why This Cycle Exists

After `0017`, the remaining broad runtime consumer was concentrated in the
dashboard CLI:

- `status --view trace`
- `status --view suggestions`
- `status --view all`

But `trace` and `suggestions` do not actually need the entire `full` snapshot.

`trace` needs:

- stories
- requirements
- criteria
- evidence
- policies
- governed completion rollups

That is already what the `audit` profile is shaped for.

`suggestions` needs:

- legacy `snapshot.suggestions`

That is already what the `analysis` profile preserves.

This cycle narrows those two views so the last deliberate raw `full` consumer
becomes `status --view all`.

## Sponsor Actors

### Primary sponsor actor

**Operator-Supervisor**

Needs the dashboard views to be honest about the data they actually consume.

### Secondary sponsor actor

**Cold-Start Worker Agent**

Needs fast, bounded dashboard reads for traceability and suggestion review
without paying for unrelated full-snapshot assembly.

## Outcome Hill

**As an operator using dashboard trace or suggestions views, I get the same
visible output through narrower snapshot profiles that match each view’s real
data needs.**

## Invariants

This cycle must preserve:

- The graph is the plan.
- `trace` view behavior and output shape
- `suggestions` view behavior and output shape
- `status --view all` remains unchanged in this slice

## Scope

In scope:

- route `status --view trace` to `profile: 'audit'`
- route `status --view suggestions` to `profile: 'analysis'`
- pin both decisions in dashboard command tests

Out of scope:

- redesigning dashboard payloads
- narrowing `status --view all`
- broader `GraphContext` refactors

## Acceptance-Test Plan

### Checkpoint 1: Trace routing

1. `status --view trace` requests `profile: 'audit'`
2. trace JSON output remains unchanged

### Checkpoint 2: Suggestion routing

3. `status --view suggestions` requests `profile: 'analysis'`
4. suggestions JSON output remains unchanged

### Checkpoint 3: Regression safety

5. `npx vitest run test/unit/DashboardTraceCommand.test.ts` passes
6. `npx tsc --noEmit` passes
7. `npm run lint` passes
8. the push firewall stays green

## Implementation Notes

- Keep `all` on `full` for now so this slice remains bounded.
- Use the existing dashboard command test file to pin the routing choices
  directly.

## Playback Questions

1. Did trace leave `full` cleanly for `audit`?
2. Did suggestions leave `full` cleanly for `analysis`?
3. Is `all` now the only deliberate raw `full` dashboard view?

## Exit Criteria

This cycle closes when:

- trace and suggestions no longer route to `full`
- focused tests pin those decisions
- the retrospective records `all` as the remaining deliberate broad dashboard
  view
