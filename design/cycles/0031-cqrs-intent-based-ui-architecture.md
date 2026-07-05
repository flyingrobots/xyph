# 0031: CQRS Intent-Based UI Architecture (Bijou Custom Blocks & Causal Intent Lowering)

## Cycle Type

Architectural Evolution & TUI Decoupling Cycle

## Status

Proposing Design — Active in the Next-Generation TUI Architecture Roadmap.

## Graph Anchor

- Work item: `task:TUI-031` (CQRS Intent-Based UI Architecture)
- Legend: TUI / AGENTIC BEDROCK (Bijou Custom Blocks, Immutable Event Streams & Causal Intent Lowering)

## Why This Cycle Exists

The legacy TUI system (`DashboardApp.ts`) suffers from architectural bloat, mixing UI layout code with synchronous business logic, direct secondary adapter calls, and monolithic graph materialization (`loadOperationalSnapshot()`). This induces UI stutter, dropped terminal keystrokes, and the infamous "stuck at 95%" loading screen stall.

To achieve true zero-hitch 60fps rendering and perfect Hexagonal isolation, we are pivoting the entire TUI to an **Immutable, Unidirectional Event Stream (CQRS)** built directly on top of Bijou v1.6.0's native Block Binding Engine, with a dedicated lowering bridge to Edict Causal Intents:

```
┌──────────────────────────────────────────────────────────────┐
│                  UI Layer (Bijou Custom Blocks)              │
│  [questCockpitBlock] ─── emits ───> RuntimeCommandIntent     │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│        Bridge / Action Route (RuntimeCommandIntentRoute)     │
│  toCommand: (emission) => EdictIntentDescriptor              │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│            Domain Core / Storage (Optic Pure)                │
│  OpticDomainActionService.submitIntent(intentDescriptor)     │
└──────────────────────────────────────────────────────────────┘
```

1. **Custom Xyph Blocks (`defineBlock`)**: Instead of hand-rolled UI layouts, we define schema-bound custom blocks (`questCockpitBlock`, `worldlineTreeBlock`, `causalFrontierBlock`) that compile down to `UiSceneIr`.
2. **CQRS Data Binding (`ViewDataContract`)**: UI blocks declare explicit data contracts (`defineViewData`, `defineDataRequirement`). They receive deeply immutable snapshots (`BindingFrame`, `BindingSnapshot`) streaming asynchronously from secondary `DataProvider` adapters, completely eliminating UI thread I/O.
3. **UI Command $\to$ Causal Intent Lowering Bridge**: When an operator initiates an action, the UI block emits a generic Bijou `RuntimeCommandIntentEmission`. A dedicated `RuntimeCommandIntentRoute` lowers this UI command into a pure Edict `IntentDescriptor`, submitting it directly to `OpticDomainActionService`.

## Sponsor Actors

### Primary Sponsor Actor

**Systems Architect**

Needs a bulletproof CQRS boundary where custom Bijou blocks act as pure reactive listeners on immutable `BindingFrame` snapshots, completely decoupled from business logic and Git storage I/O.

### Secondary Sponsor Actor

**TUI Operator / Autonomous Agent**

Needs a perfectly responsive, 60fps terminal interface with zero rendering hitches, instant intent capture, and absolute worldline sync integrity.

## Outcome Hill

**As a Systems Architect and TUI Operator, I want the TUI to operate as a pure reactive render engine using custom Bijou blocks and `ViewDataContract` bindings, lowering UI command emissions directly into `git-warp` Causal Intents (`IntentDescriptor`), ensuring zero business logic mixing, complete elimination of UI thread I/O, and absolute synchronization integrity.**

## Invariants

This cycle must preserve:
- The custom `bijou` widget styling and TUI layout expectations.
- Complete compatibility with `OpticDomainActionService` intent admission rules.
- 100% passing status for all existing unit and integration tests.

## Scope

### In Scope
- Define custom Xyph blocks (`questCockpitBlock`, `worldlineTreeBlock`) using `defineBlock` and `defineSchemaBlock`.
- Wire custom blocks to consume `ViewDataContract` and `BindingFrame` snapshots supplied by `WarpDashboardReadAdapter`.
- Establish the `RuntimeCommandIntentRoute` bridge that translates UI command emissions into Edict `IntentDescriptor` objects for `OpticDomainActionService`.
- Deprecate legacy synchronous graph materialization (`loadOperationalSnapshot()`) in `DashboardApp.ts`.

### Out of Scope
- Altering the underlying `git-warp` binary storage protocol or CRDT serialization formats.

## Acceptance-Test Plan

### Checkpoint 1: Clean build and lint
1. Running `npm run lint` and `npm run build` must be completely clean with zero errors.

### Checkpoint 2: All tests pass
2. Running `npm run test:local` must succeed with all tests passing.

### Checkpoint 3: Causal Intent Lowering Verification
3. Unit tests must verify that custom blocks cannot mutate `BindingSnapshot` data and that `RuntimeCommandIntentRoute` successfully lowers UI emissions into valid `IntentDescriptor` payloads.

## Proposed Interface Wiring

```typescript
import { defineBlock, type BlockDefinition, type ViewDataContract, type CommandIntent } from '@flyingrobots/bijou';
import { type RuntimeCommandIntentRoute, runtimeCommandIntentRoute } from '@flyingrobots/bijou-tui';
import type { IntentDescriptor } from '../../domain/models/IntentDescriptor.js';

export const questCockpitContract: ViewDataContract = { ... };

export const questCockpitBlock: BlockDefinition = defineBlock({
  blockName: 'questCockpitBlock',
  contract: questCockpitContract,
  ...
});

export const claimQuestUiIntent: CommandIntent<{ questId: string }> = { id: 'ui:intent:claim' };

export const claimQuestIntentRoute: RuntimeCommandIntentRoute<{ questId: string }, IntentDescriptor> = runtimeCommandIntentRoute({
  intent: claimQuestUiIntent,
  toCommand: (emission) => ({
    intentId: `intent:${crypto.randomUUID()}`,
    type: 'CLAIM_QUEST',
    actor: emission.owner?.id ?? 'operator:local',
    questId: emission.payload.questId,
    timestamp: Date.now(),
  }),
});
```

## Playback Questions

1. Are custom Bijou blocks 100% free of business logic, direct Git storage I/O, and raw graph mutations?
2. Are all state updates streaming via immutable `BindingFrame` snapshots to prevent component sync discrepancies?
3. Does every interactive UI action successfully lower through `RuntimeCommandIntentRoute` into a pure `IntentDescriptor` submitted to `OpticDomainActionService`?

## Exit Criteria

This cycle closes when:
- `DashboardApp` is fully migrated to custom Bijou blocks, `ViewDataContract` bindings, and `RuntimeCommandIntentRoute` lowering.
- All legacy synchronous graph materialization calls in the view layer are deprecated.
- All tests pass cleanly.
- Design cycle status is updated to completed.
