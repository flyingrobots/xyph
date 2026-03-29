# 0020: Dashboard All Workflow Census

## Cycle Type

Implementation follow-on for `0019`

This cycle follows the `0019` design decision by turning `status --view all`
into one coherent workflow-census surface.

## Graph Anchor

- Work item: `task:dashboard-all-workflow-census`

## Why This Cycle Exists

`0019` established that `all` had become semantically split:

- TUI `all` was a partial workflow census
- JSON `all` was a raw `{ ...snapshot }` dump

That meant the same named view did not mean the same thing across modes, and
it preserved the last obvious raw `full` dashboard loophole.

This cycle implements the accepted direction:

- `all` is a workflow census
- TUI and JSON agree on that meaning
- `all` routes through `operational`

## Sponsor Actors

### Primary sponsor actor

**Operator-Supervisor**

Needs one broad dashboard view that covers workflow surfaces without turning
into an accidental debug dump.

### Secondary sponsor actor

**Cold-Start Worker Agent**

Needs a stable “show me the whole workflow surface” view with bounded,
predictable semantics.

## Outcome Hill

**As an operator or agent using `status --view all`, I get one bounded
workflow-census surface in both TUI and JSON, and the dashboard no longer uses
`all` as the last hidden raw snapshot export.**

## Invariants

This cycle must preserve:

- The graph is the plan.
- `all` remains the broadest dashboard workflow view
- dedicated views like `trace` and `suggestions` stay specialized
- JSON `all` remains useful for automation, but bounded

## Scope

In scope:

- route `status --view all` to `profile: 'operational'`
- replace JSON `all` `{ ...snapshot }` with a bounded workflow-census payload
- extend TUI `renderAll()` to include:
  - submissions
  - reviews
  - decisions
- pin JSON and TUI behavior with focused tests

Out of scope:

- new raw export/debug commands
- broader `GraphContext` redesign
- changes to trace/suggestion/dashboard specialist views

## Acceptance-Test Plan

### Checkpoint 1: Routing

1. `status --view all` requests `profile: 'operational'`

### Checkpoint 2: JSON semantics

2. JSON `all` returns a bounded workflow-census payload
3. JSON `all` no longer returns raw traceability or suggestion families by
   snapshot spread

### Checkpoint 3: TUI semantics

4. `renderAll()` shows the workflow census including submissions, reviews, and
   decisions

### Checkpoint 4: Regression safety

5. focused dashboard command and render tests pass
6. `npx tsc --noEmit` passes
7. `npm run lint` passes
8. the push firewall stays green

## Implementation Notes

- Keep the operational workflow census intentionally bounded:
  - campaigns
  - intents
  - quests
  - scrolls
  - approvals
  - submissions
  - reviews
  - decisions
- Leave raw export/debug needs for a future explicit command instead of
  preserving them inside `all`.

## Playback Questions

1. Does `all` now mean the same thing in TUI and JSON?
2. Is `all` off the raw `full` path?
3. Did we remove the last obvious dashboard loophole without widening the
   product surface?

## Exit Criteria

This cycle closes when:

- `all` routes to `operational`
- JSON and TUI agree on workflow-census semantics
- focused tests pin both surfaces
- the retrospective records the remaining work as explicit export/debug needs,
  not dashboard ambiguity
