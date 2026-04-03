# 0023 Retrospective: Observer-Native Read Architecture

## Governing Design Docs

- [`/Users/james/git/xyph/design/cycles/0023-observer-native-read-architecture.md`](../cycles/0023-observer-native-read-architecture.md)
- [`/Users/james/git/xyph/docs/canonical/ARCHITECTURE.md`](../../docs/canonical/ARCHITECTURE.md)
- [`/Users/james/git/xyph/design/substrate-alignment.md`](../substrate-alignment.md)

## What Landed

- `GraphContext` is no longer the normal product-read seam.
- Normal product reads now flow through explicit observation sessions, while
  doctor-style deeper reads use a separate inspection seam.
- CLI roots now own observation, operational-read, and inspection adapter
  wiring instead of letting service call sites instantiate those seams
  implicitly.
- `show` detail reads, agent suggestion/submission flows, and review-page
  assembly now use targeted observed-session readers instead of mining the
  omnibus projection path.
- Dashboard reads are explicitly view-keyed, and the landing `Review`,
  `Suggestions`, and `Now` lanes now read through dedicated dashboard
  observers with purpose-built lane data.
- Acceptance coverage now pins the observer-session contract and the
  normal-read vs inspection split honestly.

## Design Alignment Audit

- normal product reads are explainable in terms of worldlines, observers, and
  product meaning: aligned
- human and agent surfaces can be described as projections over the same
  observed truth instead of different snapshot stories: aligned
- inspection work has a distinct seam instead of hiding inside the normal
  read port: aligned
- the remaining bridge is narrower and more obviously temporary than when the
  cycle started: aligned

## Drift

- [`/Users/james/git/xyph/src/infrastructure/adapters/WarpObservationAdapter.ts`](../../src/infrastructure/adapters/WarpObservationAdapter.ts)
  still lowers many reads through
  [`/Users/james/git/xyph/src/infrastructure/ObservedGraphProjection.ts`](../../src/infrastructure/ObservedGraphProjection.ts).
- The landing shell still boots from a broad operational snapshot for
  cross-lane counts, meta state, and compatibility with non-migrated lanes and
  drawer content.
- `Plan`, `Settlement`, `Campaigns`, `Graveyard`, and some drawer/page
  fallbacks still depend on broad snapshot-shaped assembly.
- Narrower substrate-native primitives for shell/meta reads still belong in
  future git-warp work, not another disguised XYPH-local graph engine.

## Why The Drift Happened

- The cycle was intentionally scoped as a read-boundary reset, not as a
  promise to delete every broad read in one pass.
- The highest-leverage work was moving the seam outward and stopping new
  product surfaces from deepening the compatibility bridge.
- XYPH can narrow some dashboard flows locally, but fully replacing the
  remaining shell/meta snapshot dependence would either require a larger
  dashboard lazy-load split or narrower substrate support from git-warp.

## Resolution

- Close `0023` as hill met.
- Treat the remaining shell-level landing snapshot dependency as explicit
  follow-on work instead of keeping this cycle artificially open.
- Carry that XYPH-side follow-on explicitly as `task:landing-shell-read-model`.
- Keep the compatibility bridge marked transitional until git-warp exposes
  narrower substrate-honest primitives.
- Carry forward:
  - landing-shell read-model narrowing in XYPH
  - git-warp substrate fixes and narrower observer/worldline-native read
    support upstream
