# 0018 Retrospective: Dashboard Trace and Suggestion Profiles

## Governing Design Docs

- [`/Users/james/git/xyph/design/cycles/0018-dashboard-trace-and-suggestion-profiles.md`](../cycles/0018-dashboard-trace-and-suggestion-profiles.md)
- [`/Users/james/git/xyph/design/cycles/0017-control-plane-direct-summary-reads.md`](../cycles/0017-control-plane-direct-summary-reads.md)
- [`/Users/james/git/xyph/design/substrate-alignment.md`](../substrate-alignment.md)

## What Landed

- `dashboard status --view trace` now reads through `profile: 'audit'`
- `dashboard status --view suggestions` now reads through
  `profile: 'analysis'`
- dashboard command tests now pin both profile choices while preserving the
  existing JSON envelopes

## Design Alignment Audit

- trace now reads through the profile that actually carries traceability and
  governed completion semantics: aligned
- suggestions now reads through the profile that actually preserves legacy
  suggestion state: aligned
- the slice stayed bounded and did not redesign the dashboard payloads:
  aligned

## Drift

- `dashboard status --view all` still depends on raw `full`

## Why The Drift Happened

- `all` is the last deliberate broad compatibility view in the dashboard and
  deserves its own design/implementation cut rather than being bundled into
  this narrower routing slice.

## Resolution

- Accept `all` as the remaining broad dashboard view for now.
- Carry it into the next cycle as the last obvious raw `full` dashboard
  consumer.
