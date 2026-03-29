# 0020 Retrospective: Dashboard All Workflow Census

## Governing Design Docs

- [`/Users/james/git/xyph/design/cycles/0020-dashboard-all-workflow-census.md`](../cycles/0020-dashboard-all-workflow-census.md)
- [`/Users/james/git/xyph/design/cycles/0019-dashboard-all-semantics.md`](../cycles/0019-dashboard-all-semantics.md)
- [`/Users/james/git/xyph/design/substrate-alignment.md`](../substrate-alignment.md)

## What Landed

- `dashboard status --view all` now routes through `profile: 'operational'`
- JSON `all` now returns a bounded workflow-census payload instead of
  `{ ...snapshot }`
- TUI `renderAll()` now includes:
  - submissions
  - reviews
  - decisions
- focused tests now pin both the bounded JSON surface and the broadened TUI
  workflow census

## Design Alignment Audit

- `all` now means one thing across TUI and JSON: aligned
- the dashboard no longer hides a raw snapshot export behind the `all` label:
  aligned
- dedicated views remain specialized instead of being reabsorbed into `all`:
  aligned

## Drift

- explicit raw export/debug needs, if any, still have no dedicated command
- `GraphContext` still exists as the broad assembly layer behind the remaining
  product-facing snapshot profiles

## Why The Drift Happened

- This slice was intentionally bounded to dashboard semantics, not to solving
  every remaining broad-read concern in one pass.

## Resolution

- Accept workflow-census `all` as the honest dashboard surface.
- Carry any future raw export/debug need as an explicit command design, not a
  dashboard compatibility loophole.
