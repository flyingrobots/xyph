# 0017 Retrospective: Control-Plane Direct Summary Reads

## Governing Design Docs

- [`/Users/james/git/xyph/design/cycles/0017-control-plane-direct-summary-reads.md`](../cycles/0017-control-plane-direct-summary-reads.md)
- [`/Users/james/git/xyph/design/cycles/0016-control-plane-summary-semantics.md`](../cycles/0016-control-plane-summary-semantics.md)
- [`/Users/james/git/xyph/design/substrate-alignment.md`](../substrate-alignment.md)

## What Landed

- `ControlPlaneService` summary projections now read counts directly from the
  selected graph/worldline handle via aggregate queries.
- summary now computes `graphMeta` directly from `getStateSnapshot()` and
  `getFrontier()`.
- `graph.summary` and `worldline.summary` no longer route through
  `fetchSnapshot()`.
- unit tests now pin that live, historical, and derived summary paths stay off
  the snapshot compatibility surface.
- the summary count census now includes `approvals`.

## Design Alignment Audit

- summary now behaves like an orientation projection instead of a hidden
  snapshot projection: aligned
- derived-worldline summary parity remained intact in the integration suite:
  aligned
- the slice stayed inside control-plane summary semantics and did not widen
  into broader `GraphContext` redesign: aligned

## Drift

- derived-worldline summary still relies on the existing isolated
  working-set-backed helper for parity and observation backing metadata
- summary still preserves the older count keys beyond the minimal orientation
  set for protocol stability

## Why The Drift Happened

- The goal of this slice was to repair the semantic boundary first, not to
  redesign the whole worldline helper or force protocol churn on downstream
  consumers.

## Resolution

- Accept direct aggregate summary reads as the honest boundary.
- Keep deeper derived-helper simplification and summary protocol tightening as
  future optional work, not blockers for this slice.
