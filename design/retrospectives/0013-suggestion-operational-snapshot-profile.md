# 0013 Retrospective: Suggestion Operational Snapshot Profile

## Governing Design Docs

- [`/Users/james/git/xyph/design/cycles/0013-suggestion-operational-snapshot-profile.md`](../cycles/0013-suggestion-operational-snapshot-profile.md)
- [`/Users/james/git/xyph/design/cycles/0012-wizard-operational-snapshot-profile.md`](../cycles/0012-wizard-operational-snapshot-profile.md)
- [`/Users/james/git/xyph/design/substrate-alignment.md`](../substrate-alignment.md)

## What Landed

- `suggestion accept-all` now reads through
  `fetchSnapshot(..., { profile: 'operational' })`
- the existing suggestion command unit test now pins that routing while still
  verifying the linked-evidence write behavior

## Design Alignment Audit

- legacy batch suggestion acceptance now aligns with the operational read model
  used by other workflow-oriented consumers: aligned
- the slice stayed bounded to one CLI command and one focused spec: aligned

## Drift

- analyze still depends on the full traceability snapshot
- doctor still depends on the full traceability snapshot
- control-plane `graph.summary` still depends on the full compatibility census

## Why The Drift Happened

- This cycle intentionally took the cleanest remaining legacy suggestion
  consumer.
- The remaining `full` consumers have deeper coupling to traceability or
  explicit summary semantics and deserve their own bounded slices.

## Resolution

- Accept the suggestion CLI reroute as a real reduction in the remaining
  full-snapshot surface.
- Carry analyze, doctor, and control-plane summary into later cycles instead of
  widening this slice beyond a safe scope.
