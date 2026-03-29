# 0005 Retrospective: Quest Detail Read Boundary

## Governing Design Docs

- [`/Users/james/git/xyph/design/cycles/0005-quest-detail-read-boundary.md`](../cycles/0005-quest-detail-read-boundary.md)
- [`/Users/james/git/xyph/design/cycles/0004-substrate-alignment.md`](../cycles/0004-substrate-alignment.md)
- [`/Users/james/git/xyph/design/substrate-alignment.md`](../substrate-alignment.md)

## What Landed

- `GraphContext.fetchEntityDetail(task:...)` no longer routes through
  `fetchSnapshot()`.
- `QuestDetail` is now assembled from quest-local graph reads plus targeted
  supporting traversal for campaign, intent, scroll, submission, and
  traceability data.
- Existing quest-detail behavior remained green.
- A new integration spec now pins the read-boundary rule directly.

## Design Alignment Audit

- `fetchEntityDetail(task:...)` no longer calls the omnibus snapshot path:
  aligned
- one targeted quest read now stays targeted at the application layer:
  partially aligned
- existing quest-detail semantics remained intact:
  aligned
- XYPH stopped normalizing one-quest detail as "whole dashboard snapshot first":
  aligned

## Drift

- Narrative loading still uses broad `spec:*`, `adr:*`, `note:*`, and
  `comment:*` queries inside `loadNarrativeForTargets()`.
- This means the quest-detail path is materially narrower than before, but it
  is not yet a fully local read of only directly reachable narrative nodes.

## Why The Drift Happened

- This slice was intentionally bounded around the biggest lie in the current
  path: `fetchEntityDetail(task)` calling `fetchSnapshot()`.
- Narrower narrative loading likely needs either more helper work in XYPH or a
  better substrate primitive in git-warp, and that would have expanded the
  slice substantially.

## Resolution

- Accept the current narrowing as a valid bounded slice.
- Carry forward the remaining narrative-query breadth as follow-on debt under
  the broader substrate-alignment program rather than pretending the boundary is
  fully solved.
