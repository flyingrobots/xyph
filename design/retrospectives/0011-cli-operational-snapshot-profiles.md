# 0011 Retrospective: CLI Operational Snapshot Profiles

## Governing Design Docs

- [`/Users/james/git/xyph/design/cycles/0011-cli-operational-snapshot-profiles.md`](../cycles/0011-cli-operational-snapshot-profiles.md)
- [`/Users/james/git/xyph/design/cycles/0010-operational-snapshot-profile.md`](../cycles/0010-operational-snapshot-profile.md)
- [`/Users/james/git/xyph/design/substrate-alignment.md`](../substrate-alignment.md)

## What Landed

- CLI `status` view routing is now explicit:
  - `trace`, `suggestions`, and `all` stay on `full`
  - `roadmap`, `lineage`, `inbox`, `submissions`, and `deps` use
    `operational`
- `AgentSubmissionService` now reads through the operational snapshot profile.
- Unit tests now pin both the CLI view routing and the submission queue
  routing.

## Design Alignment Audit

- operational workflow/status consumers now read through the narrower profile:
  aligned
- trace-heavy and exhaustive CLI views remained on `full`: aligned
- the slice stayed bounded and did not mix in doctor/analyze or wizard changes:
  aligned

## Drift

- doctor/analyze still depend on the full snapshot census
- wizard helper reads still default to the full snapshot
- suggestion accept-all still uses the full snapshot because legacy
  `snapshot.suggestions` lives only there

## Why The Drift Happened

- This cycle intentionally targeted consumers with clean workflow semantics and
  straightforward profile routing.
- Doctor, analyze, and legacy suggestion flows have deeper coupling to the full
  snapshot and deserve their own bounded follow-on slices.

## Resolution

- Accept the CLI/submission routing split as a real reduction in the remaining
  full-snapshot surface.
- Carry the remaining full consumers into later cycles instead of widening this
  slice beyond a safe scope.
