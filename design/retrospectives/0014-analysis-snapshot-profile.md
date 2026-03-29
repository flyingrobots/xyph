# 0014 Retrospective: Analysis Snapshot Profile

## Governing Design Docs

- [`/Users/james/git/xyph/design/cycles/0014-analysis-snapshot-profile.md`](../cycles/0014-analysis-snapshot-profile.md)
- [`/Users/james/git/xyph/design/cycles/0013-suggestion-operational-snapshot-profile.md`](../cycles/0013-suggestion-operational-snapshot-profile.md)
- [`/Users/james/git/xyph/design/substrate-alignment.md`](../substrate-alignment.md)

## What Landed

- `GraphContext` now supports `profile: 'analysis'`
- the analysis profile includes:
  - requirements
  - criteria
  - evidence
  - legacy suggestions
- the analysis profile excludes:
  - stories
  - policies
  - quest/campaign completion rollups
- `analyze` now reads through `profile: 'analysis'`
- `suggestion accept-all` now also reads through `profile: 'analysis'`,
  correcting the `0013` misfit where `operational` silently excluded legacy
  suggestions

## Design Alignment Audit

- traceability-analysis consumers now have an honest middle profile between
  `operational` and `full`: aligned
- the slice corrected the legacy suggestion routing bug without widening into
  doctor or control-plane redesign: aligned

## Drift

- doctor still depends on the full traceability snapshot
- control-plane `graph.summary` still depends on the full compatibility census

## Why The Drift Happened

- This cycle intentionally targeted the cleanest remaining traceability
  consumers.
- The remaining `full` consumers still have deeper coupling to broad summary or
  audit semantics and deserve their own bounded slices.

## Resolution

- Accept `analysis` as the next honest snapshot profile rather than forcing
  every non-operational read back onto `full`.
- Carry doctor and control-plane summary into later cycles instead of widening
  this slice.
