# 0015 Retrospective: Doctor Audit Snapshot Profile

## Governing Design Docs

- [`/Users/james/git/xyph/design/cycles/0015-doctor-audit-snapshot-profile.md`](../cycles/0015-doctor-audit-snapshot-profile.md)
- [`/Users/james/git/xyph/design/cycles/0014-analysis-snapshot-profile.md`](../cycles/0014-analysis-snapshot-profile.md)
- [`/Users/james/git/xyph/design/substrate-alignment.md`](../substrate-alignment.md)

## What Landed

- `GraphContext` now supports `profile: 'audit'`
- the audit profile includes:
  - workflow nodes
  - stories
  - requirements
  - criteria
  - evidence
  - policies
  - governed completion rollups
  - legacy suggestions
- the audit profile excludes:
  - case nodes
  - governance comparison artifacts
  - collapse proposals
  - attestations
  - AI suggestion case-link assembly
- `DoctorService` now reads through `profile: 'audit'`

## Design Alignment Audit

- doctor now has an explicit rich-audit profile instead of hiding behind raw
  `full`: aligned
- the slice stayed bounded to doctor semantics and did not widen into
  control-plane summary redesign: aligned

## Drift

- control-plane `graph.summary` still depends on the full compatibility census

## Why The Drift Happened

- Doctor was the cleaner of the two remaining rich consumers because it already
  owns its explicit patchset/narrative/comment scans.
- Control-plane summary still packages broader user-facing semantics and
  deserves its own design cut.

## Resolution

- Accept `audit` as the honest rich profile for structural health diagnostics.
- Carry control-plane summary into the next cycle instead of widening this one.
