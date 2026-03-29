# 0012 Retrospective: Wizard Operational Snapshot Profile

## Governing Design Docs

- [`/Users/james/git/xyph/design/cycles/0012-wizard-operational-snapshot-profile.md`](../cycles/0012-wizard-operational-snapshot-profile.md)
- [`/Users/james/git/xyph/design/cycles/0011-cli-operational-snapshot-profiles.md`](../cycles/0011-cli-operational-snapshot-profiles.md)
- [`/Users/james/git/xyph/design/substrate-alignment.md`](../substrate-alignment.md)

## What Landed

- The shared interactive wizard helper now reads through
  `fetchSnapshot(..., { profile: 'operational' })`
- A new unit test pins that routing through `review-wizard`, exercising a real
  interactive command path rather than a helper-only mock

## Design Alignment Audit

- wizard workflow reads now use the same operational snapshot model as other
  workflow surfaces: aligned
- the slice stayed bounded to one helper family and one focused command spec:
  aligned

## Drift

- analyze still depends on the full traceability snapshot
- doctor still depends on the full traceability snapshot
- legacy suggestion batch acceptance still depends on `snapshot.suggestions`

## Why The Drift Happened

- This cycle intentionally chose the lowest-risk remaining helper family.
- The remaining consumers have deeper coupling to traceability or legacy
  compatibility shapes and deserve their own bounded follow-on slices.

## Resolution

- Accept the wizard helper reroute as a real reduction in the remaining
  full-snapshot surface.
- Carry analyze, doctor, and legacy suggestion consumers into later cycles
  instead of widening this slice beyond a safe scope.
