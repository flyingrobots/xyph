# 0008 Retrospective: git-warp v15 Surface Migration

## Governing Design Docs

- [`/Users/james/git/xyph/design/cycles/0008-git-warp-v15-surface-migration.md`](../cycles/0008-git-warp-v15-surface-migration.md)
- [`/Users/james/git/xyph/design/cycles/0007-quest-detail-narrative-read-boundary.md`](../cycles/0007-quest-detail-narrative-read-boundary.md)
- [`/Users/james/git/xyph/design/cycles/0004-substrate-alignment.md`](../cycles/0004-substrate-alignment.md)
- [`/Users/james/git/xyph/design/substrate-alignment.md`](../substrate-alignment.md)

## What Landed

- XYPH now depends on published `@git-stunts/git-warp` `^15.0.1`.
- Substrate-heavy graph consumers now type against `WarpCore` explicitly
  instead of the removed flat runtime/default surface.
- Removed `working set` substrate calls were migrated to their `strand`
  equivalents across comparison, patch, materialization, and braid flows.
- Canonical derived-worldline graph contexts now read through a strand-backed
  `worldline()` facade, so summary/detail/diff/conflict reads observe actual
  derived truth instead of live graph truth.
- Existing parity, read-boundary, and local full-suite coverage remained green.

## Design Alignment Audit

- XYPH now consumes the released `git-warp` `v15` surface directly: aligned
- removed `working set` substrate calls are gone from active code paths:
  aligned
- derived worldline reads now stay pinned to requested strand truth: aligned
- the slice stayed bounded to compatibility and read honesty, not a full graph
  consumer redesign: aligned

## Drift

- XYPH still has several services that legitimately type against `WarpCore`
  because they perform substrate work directly.
- The broader question of which future XYPH reads should migrate from core-like
  access to `WarpApp` / `worldline()` ergonomics remains open.
- Some internal helper names in XYPH still say `workingSetId` because they map
  XYPH worldline identifiers onto substrate strand identifiers.

## Why The Drift Happened

- This cycle was scoped to consuming the published substrate release honestly,
  not to redesigning all graph-touching application surfaces at once.
- Keeping a few XYPH helper names stable reduced migration blast radius while
  the active behavioral change was the substrate API cut and the derived-read
  honesty fix.

## Resolution

- Accept this slice as a real compatibility and honesty win.
- Carry forward the broader `WarpApp` / `WarpCore` ergonomics question as
  follow-on substrate-alignment work rather than pretending XYPH should stop
  using `WarpCore` in places where it genuinely needs substrate facts.
