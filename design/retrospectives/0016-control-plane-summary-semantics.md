# 0016 Retrospective: Control-Plane Summary Semantics

## Governing Design Docs

- [`/Users/james/git/xyph/design/cycles/0016-control-plane-summary-semantics.md`](../cycles/0016-control-plane-summary-semantics.md)
- [`/Users/james/git/xyph/design/cycles/0015-doctor-audit-snapshot-profile.md`](../cycles/0015-doctor-audit-snapshot-profile.md)
- [`/Users/james/git/xyph/design/substrate-alignment.md`](../substrate-alignment.md)
- [`/Users/james/git/xyph/design/sponsor-actors.md`](../sponsor-actors.md)

## What Landed

- We explicitly defined `graph.summary` and `worldline.summary` as
  **orientation projections**, not snapshot projections.
- We rejected the idea of solving summary by adding yet another
  `GraphSnapshotProfile`.
- We chose a direct summary read helper over the selected graph/worldline
  handle as the implementation direction for the next slice.

## Key Findings

- The current summary payload is thin: counts plus `graphMeta`.
- The current implementation is broad: it pays for full snapshot assembly.
- The current semantics are already inconsistent because summary omits
  `approvals` while still exposing several traceability-family counts.
- Existing summary tests mostly care about parity and metadata, not about broad
  snapshot assembly.

## Design Alignment Audit

- summary is now framed around operator/agent orientation instead of snapshot
  convenience: aligned
- the chosen direction preserves derived-worldline parity without adding more
  snapshot-profile sprawl: aligned
- the decision keeps doctor and entity detail as richer surfaces for audit and
  diagnosis: aligned

## Drift

- The implementation slice has not landed yet.
- `ControlPlaneService` still currently routes summary through
  `fetchSnapshot()`.

## Why The Drift Happened

- This cycle was intentionally design-first because summary was the last raw
  `full` consumer and the wrong “quick fix” would have been to add another
  snapshot profile.

## Resolution

- Proceed with the next implementation slice by removing summary from
  `fetchSnapshot()` entirely.
- Prefer direct aggregate count queries over model assembly.
- Keep the first implementation slice conservative on wire shape and revisit
  protocol cleanup only after the semantic boundary is repaired.
