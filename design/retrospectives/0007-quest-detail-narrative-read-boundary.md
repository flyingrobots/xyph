# 0007 Retrospective: Quest Detail Narrative Read Boundary

## Governing Design Docs

- [`/Users/james/git/xyph/design/cycles/0007-quest-detail-narrative-read-boundary.md`](../cycles/0007-quest-detail-narrative-read-boundary.md)
- [`/Users/james/git/xyph/design/cycles/0005-quest-detail-read-boundary.md`](../cycles/0005-quest-detail-read-boundary.md)
- [`/Users/james/git/xyph/design/cycles/0004-substrate-alignment.md`](../cycles/0004-substrate-alignment.md)
- [`/Users/james/git/xyph/design/substrate-alignment.md`](../substrate-alignment.md)

## What Landed

- `loadNarrativeForTargets()` no longer scans global `spec:*`, `adr:*`,
  `note:*`, and `comment:*` families during quest-detail reads.
- Quest-detail narrative loading now starts from the bounded `relevantIds`
  target set and expands only through attached `documents` / `comments-on`
  edges plus local `supersedes` / `replies-to` closure.
- Existing quest-detail document, comment, supersession, reply, and timeline
  behavior remained green.
- A new integration test now pins the absence of whole-family narrative scans
  during `fetchEntityDetail(task:...)`.

## Design Alignment Audit

- quest-detail narrative loading no longer performs global narrative-family
  scans: aligned
- the read path now starts from bounded relevant anchors and expands locally:
  aligned
- existing narrative and timeline behavior remained intact: aligned
- this slice stayed bounded to quest-detail reads instead of rewriting the
  snapshot path too: aligned

## Drift

- The omnibus snapshot path in `fetchSnapshot()` still uses broad family queries
  for its dashboard-shaped materialization.
- Quest-detail narrative expansion now does more fine-grained neighbor and prop
  reads, which is a truthful trade for locality but not yet benchmarked.

## Why The Drift Happened

- This cycle was scoped to quest-detail boundary honesty, not to deleting the
  snapshot model from XYPH entirely.
- Benchmarking or broader snapshot refactors would have expanded the slice past
  the bounded follow-on goal.

## Resolution

- Accept this slice as a real boundary improvement for entity-detail reads.
- Carry forward the broader snapshot-path read-model debt under the continuing
  substrate-alignment effort instead of pretending all read surfaces are now
  equally honest.
