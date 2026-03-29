# 0010 Retrospective: Operational Snapshot Profile

## Governing Design Docs

- [`/Users/james/git/xyph/design/cycles/0010-operational-snapshot-profile.md`](../cycles/0010-operational-snapshot-profile.md)
- [`/Users/james/git/xyph/design/cycles/0009-snapshot-read-honesty.md`](../cycles/0009-snapshot-read-honesty.md)
- [`/Users/james/git/xyph/design/cycles/0008-git-warp-v15-surface-migration.md`](../cycles/0008-git-warp-v15-surface-migration.md)
- [`/Users/james/git/xyph/design/substrate-alignment.md`](../substrate-alignment.md)

## What Landed

- `GraphContext.fetchSnapshot()` now supports explicit snapshot profiles:
  `full` and `operational`.
- `full` remains the default and preserves the existing traceability census and
  completion rollups.
- `operational` skips the traceability-family census and completion rollups
  while still preserving quests, campaigns, submissions, governance artifacts,
  AI suggestions, and linked case metadata.
- Dashboard and agent hot paths now read through the operational profile
  instead of the broad full snapshot by default.
- Read-path tests now pin both the skipped traceability scans and preserved AI
  suggestion to case linking.

## Design Alignment Audit

- default snapshot behavior stayed full and truth-preserving: aligned
- hot operational callers now pay for a narrower read profile: aligned
- AI suggestion to case linking survived the narrowed operational profile:
  aligned
- this slice narrowed snapshot cost without pretending to delete the snapshot
  model: aligned

## Drift

- `GraphSnapshot` is still a broad compatibility shape even when some arrays
  are intentionally empty in the operational profile.
- CLI/dashboard/status and doctor-style consumers still rely on the full
  snapshot path.
- `GraphContext` remains a large app-owned assembly surface.

## Why The Drift Happened

- This cycle intentionally targeted a bounded hotspot: reduce the live
  dashboard/agent census cost without expanding into a full dashboard model
  rewrite.
- Removing the snapshot shape entirely would have mixed read-boundary work with
  a much larger application projection redesign.

## Resolution

- Accept the operational snapshot profile as a real read-boundary improvement.
- Carry forward the broader follow-on: shrink or replace the remaining full
  snapshot/dashboard compatibility surface in later cycles instead of
  overstating what this slice accomplished.
