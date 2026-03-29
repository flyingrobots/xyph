# Alignment Sweep — 2026-03

This document captures a short philosophical alignment sweep across the current
design corpus, legacy docs, live backlog, and graveyard.

The purpose is simple:

- keep only features and tasks that still fit today's XYPH
- demote stale docs before they keep lying
- avoid treating old ideas as obligations just because they survived in the
  graph

## Current Doctrine

The current governing model is:

- one design corpus for human and agent surfaces
- equal design attention for both lenses
- agent-first technical seams by default
- human-first judgment and explainability
- graph is the plan
- governance and provenance are first-class

## Document Sweep

### Canonical And Healthy

These remain active sources of truth:

- [`/Users/james/git/xyph/design/README.md`](./README.md)
- [`/Users/james/git/xyph/design/product-model.md`](./product-model.md)
- [`/Users/james/git/xyph/design/sponsor-actors.md`](./sponsor-actors.md)
- [`/Users/james/git/xyph/design/hills.md`](./hills.md)
- [`/Users/james/git/xyph/design/playbacks.md`](./playbacks.md)
- [`/Users/james/git/xyph/docs/canonical/`](../docs/canonical)
- graph-backed roadmap, inbox, and dependencies via `xyph-actuator.ts status`

### Removed Or Demoted

This sweep concluded that several older planning documents no longer earned
their place in the active repo surface:

- `TASKS.md` was removed entirely
- `docs/PLAN.md` was removed entirely
- `docs/TUI-plan.md` was removed entirely
- the milestone spine in [`/Users/james/git/xyph/README.md`](../README.md)
  remains, but only as historical context rather than active planning truth

### Sweep Decision

The repo should treat the unified design corpus plus the graph backlog as the
living source of product intent. Competing planning docs should be removed once
they no longer help more than they confuse.

## Backlog Sweep

The live backlog contains a mix of:

- still-valid future work
- tasks already realized in a different shape
- obsolete UI ideas from before the landing/page redesign
- substrate or compatibility work that is intentionally deferred

### Clear Rejects

These were judged misaligned with the current product model and retired during
this sweep rather than left in BACKLOG:

- `task:tui-suggestion-tab`
  Why: Suggestions is now a first-class lane/page, not a tab-shaped add-on.
- `task:dashboard-suggestion-widget`
  Why: suggestions should not be demoted to a right-column summary widget when
  they already have their own lane and governed page model.
- `task:tui-quest-modal`
  Why: quest pages replaced the old modal deep-dive pattern.
- `task:warp-explorer-view`
  Why: graph-explorer vanity is intentionally subordinate to operator,
  governance, and work surfaces.

### Backlog Drift Worth Reconciling Soon

Some backlog items appear to be shipped in different form or likely need to be
closed, superseded, or rewritten rather than merely left in BACKLOG:

- `task:GRV-001`
- `task:GRV-002`
- parts of the old `OVR-*` dashboard redesign cluster

Those are not automatic rejects, but they do indicate graph drift between past
implementation and current status bookkeeping.

## Graveyard Sweep

Current conclusion: no obvious graveyard item should be reopened as-is.

The graveyard mostly contains one of three things:

- obsolete abstractions replaced by better-shaped work
- old idea placeholders superseded by newer backlog items
- experiments that no longer fit the current product doctrine

Examples:

- `task:agent-briefing` and `task:agent-next`
  Superseded by the current agent CLI and later AGT tasks.
- `task:BX-017`
  Old abstraction shape, not today's product outcome.
- `task:IDEA-*` and older traceability heat-map variants
  Better treated as new work if they ever return, not reopened wholesale.

## Immediate Actions From This Sweep

1. keep codifying the unified human + agent doctrine in the design corpus
2. retire clearly obsolete backlog tasks instead of letting them accumulate
3. reconcile shipped-but-backlogged items in a later cleanup cycle
4. prefer new work items over reopening stale graveyard tasks when the old task
   shape no longer fits the current product model
