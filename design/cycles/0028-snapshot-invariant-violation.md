# 0028: Snapshot Invariant Violation (Bedrock Query Alignment)

## Cycle Type

Refactoring & Architectural Alignment cycle

## Status

Active — Design complete, implementation starting.

## Graph Anchor

- Work item: `task:snapshot-invariant-violation`
- Legend: BEDROCK (infrastructure/adapter layer)

## Why This Cycle Exists

The current `ObservedGraphProjection.ts` is a 3,576-line file that manually queries, walks, and reconstructs CRDT state structures (OR-Set state, property vectors, edge sets) to produce `GraphSnapshot` and detailed entity views. This duplicates the core state interpretation logic already implemented in the `@git-stunts/git-warp` library (specifically via `QueryBuilder` and `createStateReader`).

By keeping this low-level code in XYPH:
1. We risk correctness drift where XYPH's custom parser interprets the graph state differently from `git-warp`'s official StateReader.
2. The read path is bloated and difficult to maintain.
3. We bypass the optimized index-backed query execution engine inside `git-warp`.

## Sponsor Actors

### Primary Sponsor Actor

**Application Integrator**

Needs a thin, clean read boundary that matches `git-warp`'s actual model and doesn't duplicate core graph engine logic.

### Secondary Sponsor Actor

**Operator-Supervisor**

Needs absolute assurance that the TUI/CLI and `git-warp` share bit-identical graph state representations without semantic drift.

## Outcome Hill

**As an integrator, I want ObservedGraphProjection to fetch and construct graph snapshots using git-warp's native QueryBuilder and createStateReader APIs, eliminating custom CRDT rebuilding logic and reducing file size/complexity, while ensuring complete behavioral parity and bit-identical outputs.**

## Invariants

This cycle must preserve:
- The public `ObservedGraphProjection` interface.
- Complete output compatibility for `GraphSnapshot` and `EntityDetail` types (no changes to caller-facing TUI/CLI APIs).
- The existing write paths and persistence adapter designs.

## Scope

### In Scope
- Refactor `ObservedGraphProjection.ts` to replace manual node/edge/property iteration with `QueryBuilder` and `createStateReader`.
- Migrate `fetchSnapshot` (for all profiles: `full`, `operational`, `analysis`, `audit`) to retrieve the state reader from the underlying `WarpGraph` and construct snapshots.
- Migrate `fetchEntityDetail` to use the state reader for retrieving properties, content metadata, and neighbors.
- Delete custom CRDT/OR-Set parsing code inside `ObservedGraphProjection.ts` that is now redundant.
- Verify 100% regression parity using the existing test suite.

### Out of Scope
- Performance optimization beyond what `git-warp` natively provides.
- Modifying write paths or persistence adapters.

## Acceptance-Test Plan

### Checkpoint 1: Clean compile and lint
1. Running `npm run lint` and `npm run build` must be completely clean with no type or import errors.

### Checkpoint 2: 100% Regression Parity
2. Every existing unit, integration, and acceptance test (1000+ tests) must pass with zero modifications.
3. The Bijou TUI and actuator CLI status output must match pre-refactoring outputs exactly.

### Checkpoint 3: Code reduction
4. Significant reduction in lines of code/complexity in `ObservedGraphProjection.ts`.

## Implementation Notes

- The `git-warp` `createStateReader` API takes a materialized `WarpState` (from `await graph.getStateSnapshot()`) and exposes clean methods:
  - `hasNode(id)`
  - `getNodes()`
  - `getNodeProps(id)`
  - `neighbors(id, direction, label)`
  - `inspectNode(id)`
- We will leverage `createStateReader` to pull the node lists and properties directly, rather than manually parsing the internal transaction/op log or walking all graph structures.

## Playback Questions

1. Did we successfully delete the low-level custom CRDT parsing code?
2. Do all existing tests pass green under the new query/state reader boundary?

## Exit Criteria

This cycle closes when:
- Refactoring is complete and all vitest tests pass.
- Build and lint are clean.
- `ObservedGraphProjection.ts` code footprint is significantly reduced.
- Design cycle status is updated to completed.
