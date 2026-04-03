# Backlog Fallback Queue

This file is a temporary capture queue for backlog items discovered while the
WARP graph is unavailable, unhealthy, or otherwise not trustworthy enough to
serve as the operational planning surface.

The graph remains the plan.

This file is **not** a replacement for the graph. Every item recorded here
should be reconciled back into the graph once graph access is healthy again.

## Pending Reconciliation

### Recovery priority order

These are the currently agreed immediate priorities while the graph/read
architecture is still being stabilized:

1. Finish the logger.
2. Read architecture: pivot away from `GraphContext`.
   Current cycle note:
   [`/Users/james/git/xyph/design/cycles/0023-observer-native-read-architecture.md`](./cycles/0023-observer-native-read-architecture.md)

### Export backlog and graph snapshots to Markdown

- Requested on 2026-03-31 during graph-debugging pivot work.
- Why it matters:
  - losing access to the graph made it hard to inspect backlog truth and
    upcoming work
  - a durable Markdown export would give humans a legible fallback artifact
    during graph incidents
- Desired outcome:
  - export backlog snapshots, and probably broader graph snapshots, to a set
    of Markdown files
  - support at least a backlog-oriented export and an everything-oriented
    export
  - make the export useful for recovery, review, and offline inspection
- Candidate shape:
  - `xyph export snapshot --view backlog --format markdown`
  - `xyph export snapshot --view all --format markdown`
  - optional directory output with one index file plus per-entity detail files
- Reconcile to graph once graph operations are healthy again.
