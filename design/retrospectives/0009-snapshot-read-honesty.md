# 0009 Retrospective: Snapshot Read Honesty

## Governing Design Docs

- [`/Users/james/git/xyph/design/cycles/0009-snapshot-read-honesty.md`](../cycles/0009-snapshot-read-honesty.md)
- [`/Users/james/git/xyph/design/cycles/0008-git-warp-v15-surface-migration.md`](../cycles/0008-git-warp-v15-surface-migration.md)
- [`/Users/james/git/xyph/design/cycles/0004-substrate-alignment.md`](../cycles/0004-substrate-alignment.md)
- [`/Users/james/git/xyph/design/substrate-alignment.md`](../substrate-alignment.md)

## What Landed

- `GraphContext.fetchSnapshot()` no longer pre-materializes the live graph
  before building the dashboard snapshot.
- `GraphContext.fetchEntityDetail()` no longer pre-materializes the live graph
  before targeted entity reads.
- Historical tick reads remain explicit in `ControlPlaneService` via
  `openObservationGraph()`, which is still where ceiling-based materialization
  happens.
- Read-honesty integration coverage now pins the absence of live pre-read
  materialization directly.

## Design Alignment Audit

- live dashboard/detail reads no longer teach "materialize first": aligned
- historical tick reads remain explicit about where materialization still
  happens: aligned
- snapshot/detail semantics remained green: aligned
- this slice stayed bounded to pre-read materialization honesty, not broader
  snapshot-shape deletion: aligned

## Drift

- `fetchSnapshot()` still performs broad family queries because the dashboard
  projection itself is still snapshot-shaped.
- `GraphContext` remains a large compatibility surface with app-owned assembly
  logic.

## Why The Drift Happened

- This cycle targeted one bounded lie: default live read paths pre-materialized
  even though they no longer consumed the materialized state.
- Deleting or radically shrinking the snapshot model would have expanded the
  slice beyond a safe follow-on.

## Resolution

- Accept this slice as a real read-boundary improvement.
- Carry forward the broader snapshot/dashboard-shape reduction as separate
  follow-on work instead of pretending `GraphContext` is now fully minimal.
