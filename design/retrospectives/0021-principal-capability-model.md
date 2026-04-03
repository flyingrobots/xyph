# 0021 Retrospective: Principal Capability Model

## Governing Design Docs

- [`/Users/james/git/xyph/design/cycles/0021-principal-capability-model.md`](../cycles/0021-principal-capability-model.md)
- [`/Users/james/git/xyph/docs/canonical/AUTHORITY_MODEL.md`](../../docs/canonical/AUTHORITY_MODEL.md)
- [`/Users/james/git/xyph/docs/canonical/ARCHITECTURE.md`](../../docs/canonical/ARCHITECTURE.md)
- [`/Users/james/git/xyph/design/substrate-alignment.md`](../substrate-alignment.md)

## What Landed

- The design corpus now states one principal-general capability model instead
  of drifting toward separate human and agent permission systems.
- Human-reserved powers are framed as the current default reservation posture,
  not as a second hidden ontology.
- A bounded cycle note and acceptance-spec scaffold were created for the
  authority direction.
- No spec checkpoint, semantic checkpoint, or implementation slice landed.

## Design Alignment Audit

- one authority model across principals: aligned
- observer profile does not itself grant authority: aligned
- human-reserved powers as default reservations rather than metaphysics:
  aligned
- cycle sequencing against the actual product bottleneck: not aligned

## Drift

- XYPH's active graph-read path is still centered on
  [`/Users/james/git/xyph/src/infrastructure/GraphContext.ts`](../../src/infrastructure/GraphContext.ts),
  which acts like an app-local graph engine.
- The default app seam still exposes raw substrate shape through
  [`/Users/james/git/xyph/src/ports/GraphPort.ts`](../../src/ports/GraphPort.ts).
- `briefing`, `status`, and the dashboard remain too dependent on broad
  snapshot-shaped assembly.
- The graph itself is currently not trustworthy enough as an operational
  planning surface, so capability work is not the highest-leverage slice.

## Why The Drift Happened

- Earlier snapshot-honesty work reduced some lies in the read path without
  deleting the broader snapshot-shaped seam.
- We started the authority cycle after a correct doctrine discussion, but
  before paying down the more urgent observer/worldline boundary debt.
- XYPH kept enough substrate orchestration in application code that the graph
  debugging crisis surfaced first.

## Resolution

- Halt `0021` before further implementation.
- Keep the doctrine outputs that remain valid.
- Pivot the next work toward:
  - observer/worldline-native read architecture
  - durable, always-on file logging for graph/debug paths
  - graph-read failure diagnosis and recovery
- Revisit the principal capability model after the read architecture is
  stabilized, because the direction is still valid but the sequencing was not.
