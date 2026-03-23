# 0001: BIJOU v4 Uplift

## Cycle Type

Debt-reduction / compatibility cycle

This is not a net-new product feature milestone. It is a bounded upgrade cycle
to preserve XYPH's TUI truthfulness and delivery velocity while BIJOU moves to
its v4 rendering contract.

## Graph Anchor

- Work item: `task:bijou-v4-uplift`

## Why This Cycle Exists

Published BIJOU packages are now at `4.0.0`.

The important break is not cosmetic. BIJOU v4 removes raw string support from
fullscreen runtime views and now requires `Surface | LayoutNode` output.
Current XYPH TUI runtime code still relies on string-returning view boundaries.

If XYPH upgrades casually, the risk is not just TypeScript churn. The risk is a
broken or misleading TUI at the exact point where the product is becoming more
operator-critical.

## Sponsor Actors

### Human sponsor actor

**Collaborating human builder**

Needs to upgrade BIJOU without losing confidence that XYPH's TUI still behaves
honestly and that page/overlay/input behavior has not regressed.

### Agent sponsor actor

**Causal implementation agent**

Needs a rendering contract that is explicit and machine-checkable, so it can
modify TUI code without depending on legacy string seams that the toolkit no
longer supports.

## Outcome Hill

**As a collaborating human builder or causal implementation agent, I can move
XYPH onto BIJOU v4 without breaking the truthful operator experience, because
the runtime rendering contract, tests, and design note all agree on what the
upgrade is allowed to change and what it must preserve.**

## Invariants

This cycle must preserve:

- Hexagonal architecture. The upgrade is not permission to move domain or
  orchestration logic into BIJOU-facing view code.
- The graph is the plan. No migration shortcut may introduce hidden UI state as
  a replacement for graph truth.
- Governance and provenance visibility. Review, settlement, and suggestion
  surfaces must remain inspectable after the upgrade.
- Human and agent surface parity. The TUI may change rendering mechanics, but it
  must not drift from the CLI's underlying graph truth.
- Boring operator UX. This is a compatibility and quality cycle, not a
  redesign-by-accident.

## Scope

In scope:

- upgrade `@flyingrobots/bijou`
- upgrade `@flyingrobots/bijou-node`
- upgrade `@flyingrobots/bijou-tui`
- convert fullscreen runtime return values from raw strings to
  `Surface | LayoutNode`
- update tests that currently assume string-returning runtime views
- preserve current page stack, overlays, footer controls, input behavior,
  scrollbars, and mouse interactions

Out of scope:

- new top-level XYPH product features
- BIJOU upstreaming work
- broad TUI redesign
- changing XYPH ontology or governance semantics

## Acceptance-Test Plan

Before implementation is considered done, executable tests should pin these
behaviors:

1. The dashboard runtime no longer returns raw strings from fullscreen view
   boundaries.
2. Landing, quest, review, governance, and suggestion pages still render.
3. Comment / ask-AI / palette text input still accepts spaces and keeps stable
   modal width.
4. Footer control rails remain visible and context-first.
5. Mouse interaction and scrollbars still work in worklist, inspector, drawer,
   and modal surfaces.
6. The quest tree modal, help modal, and confirm dialogs still render without
   style bleed.

## Implementation Notes

- Treat the BIJOU v4 migration guide as canonical for the rendering contract.
- Prefer narrow adapter and view-boundary updates over cross-cutting rewrites.
- Preserve deterministic testability. Do not trade one compatibility break for
  timing-sensitive behavior.

## Playback Questions

After the cycle lands, ask:

1. Can a human operator still launch `npm run tui` and move through the current
   pages without visible regressions?
2. Did the upgrade reduce legacy rendering ambiguity instead of hiding it?
3. Can an implementation agent now reason about the TUI boundary with less
   folklore and fewer "string view" exceptions?
4. Did we avoid smuggling a redesign into a compatibility cycle?

## Exit Criteria

This cycle closes when:

- the BIJOU v4 packages are in XYPH
- the runtime obeys the new `Surface | LayoutNode` contract
- the acceptance suite is green
- the README only changes if user-visible TUI launch or behavior changed
- the next backlog reconciliation can decide whether BIJOU upstream follow-up is
  worth a separate cycle
