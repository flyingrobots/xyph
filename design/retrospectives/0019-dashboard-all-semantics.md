# 0019 Retrospective: Dashboard All Semantics

## Governing Design Docs

- [`/Users/james/git/xyph/design/cycles/0019-dashboard-all-semantics.md`](../cycles/0019-dashboard-all-semantics.md)
- [`/Users/james/git/xyph/design/cycles/0018-dashboard-trace-and-suggestion-profiles.md`](../cycles/0018-dashboard-trace-and-suggestion-profiles.md)
- [`/Users/james/git/xyph/design/substrate-alignment.md`](../substrate-alignment.md)
- [`/Users/james/git/xyph/design/sponsor-actors.md`](../sponsor-actors.md)

## What Landed

- We explicitly defined `status --view all` as a **workflow census**, not a raw
  snapshot dump.
- We identified the current semantic split:
  - TUI `all` is a partial workflow view
  - JSON `all` is a raw snapshot-shaped payload
- We rejected the idea of making `all` literally “everything” by keeping it on
  `full`.
- We chose `operational` + explicit workflow families as the implementation
  direction for the next slice.

## Key Findings

- The current “All XYPH Nodes” label overclaims what the TUI actually renders.
- The current JSON path silently uses `all` as an internal transport dump.
- The missing workflow families are clear:
  - submissions
  - reviews
  - decisions
- Traceability and suggestion artifacts already have dedicated views and should
  not be pulled back into `all`.

## Design Alignment Audit

- the chosen direction keeps dashboard semantics operator-facing instead of
  debug-dump-facing: aligned
- it preserves progressive narrowing by making `all` the broadest workflow view
  rather than the last raw `full` loophole: aligned
- it makes room for a future explicit export/debug surface if needed, instead
  of hiding that need in `all`: aligned

## Drift

- The implementation slice has not landed yet.
- `status --view all` still currently routes through `full` and still uses the
  old split semantics.

## Why The Drift Happened

- This cycle was intentionally design-first because `all` had become both a
  routing problem and a product-semantics problem.

## Resolution

- Proceed with the next slice by routing `all` to `operational`.
- Make TUI and JSON agree on the workflow-census semantics.
- Add any needed explicit export/debug surface later rather than preserving the
  raw snapshot dump under the `all` label.
