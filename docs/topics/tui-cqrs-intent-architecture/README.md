# Architectural Topic: TUI CQRS Intent Architecture & Causal Lowering

> [!TIP]
> **DEFINITIVE SYSTEM BLUEPRINT**
> This topic guide establishes the canonical architecture for Xyph's next-generation TUI. It covers the complete decoupling of the view layer using Bijou v1.6.0 Blocks, unidirectional `ViewDataContract` bindings, immutable event streams, and the `RuntimeCommandIntentRoute` lowering bridge to `git-warp` Causal Intents.

---

## 1. The TUI Tension: Monolithic Bloat vs. 60fps Decoupling

In legacy TUI architectures, view layout logic is frequently coupled with direct database access, raw storage patches, and synchronous graph materialization. In Xyph's legacy `DashboardApp.ts`, this manifested as:
- **Synchronous Snapshot Loading**: Executing `loadOperationalSnapshot()` directly on the UI event loop, freezing terminal rendering and dropping operator keystrokes.
- **Imperative Graph Mutations**: Write commands (e.g., `claimQuest`) directly invoking `graph.patch`, leaking Edict CRDT property knowledge into the view layer.

To achieve uncompromised 60fps rendering, absolute Hexagonal isolation, and strict domain purity, Xyph adopts a pure **CQRS (Command Query Responsibility Segregation) Block Binding Architecture** powered by `@flyingrobots/bijou` v1.6.0.

---

## 2. The Core Tenets

### I. Unidirectional CQRS Data Binding (`ViewDataContract`)
UI views in Xyph never fetch data or execute synchronous queries. Instead, they declare explicit `ViewDataContract` requirements (`defineViewData`).
- **Secondary `DataProvider` Adapters**: Background storage adapters (`WarpDashboardReadAdapter`, `git-cas` worker pool) fulfill data requirements asynchronously.
- **Immutable `BindingFrame` Snapshots**: When a new causal cone or worldline update settles, the provider emits a deeply immutable `BindingSnapshot` (`Object.freeze` / `DeepReadonly`).
- **Strict Read-Only Views**: UI components act purely as reactive render engines ($f(\text{state}) \to \text{UI}$) and cannot mutate data in-place.

### II. Generic Bijou Blocks (`defineBlock`)
Instead of ad-hoc UI wiring, Xyph leverages Bijou's `defineBlock` and `defineSchemaBlock` primitives to construct schema-bound custom blocks (`questCockpitBlock`, `worldlineTreeBlock`).
- Blocks remain entirely pristine and generic.
- Zero business logic, zero CRDT awareness, and zero Git storage I/O exist within a block.

### III. The UI Command $\to$ Causal Intent Lowering Bridge
When a TUI operator initiates an action (e.g., claiming a task), the UI block does not invoke a service or call `graph.patch`. It emits a generic Bijou `RuntimeCommandIntentEmission`.

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

- **`RuntimeCommandIntentRoute`**: Acts as our explicit Hexagonal translation bridge. It intercepts generic UI emissions (e.g., `ui:intent:claim`) and lowers them into concrete, cryptographically verifiable Edict `IntentDescriptor` objects.
- **`OpticDomainActionService`**: Receives the pure `IntentDescriptor`, runs pure Edict precommit guards, and applies immutable Edict Emitter patches to `git-warp`.

---

## 3. Pioneer Implementation: The `claimQuest` Slice

To prove this architecture end-to-end without risking regressions across Xyph's 1,028 passing tests, we establish a pioneer slice targeting `claimQuest` in `src/tui/bijou/write-cmds.ts`.

### Legacy Imperative Anti-Pattern (Deprecated)
```typescript
// LEAK: TUI directly manipulates raw graph CRDT properties
await graph.patch((p) => {
  p.setProperty(questId, 'assigned_to', deps.agentId)
    .setProperty(questId, 'status', 'IN_PROGRESS')
    .setProperty(questId, 'claimed_at', Date.now());
});
```

### Modern CQRS Lowering Bridge (Canonical)
```typescript
import { commandIntent, type CommandIntent } from '@flyingrobots/bijou';
import { runtimeCommandIntentRoute, type RuntimeCommandIntentRoute } from '@flyingrobots/bijou-tui';
import type { IntentDescriptor } from '../../domain/models/IntentDescriptor.js';

// 1. Pristine UI Intent Declaration
export const claimQuestUiIntent: CommandIntent<{ questId: string }> = { id: 'ui:intent:claim' };

// 2. Canonical Translation Route to Edict Causal Intent
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

---

## 4. Architectural Verification & Invariants

To maintain absolute system integrity, all future TUI development must abide by the following invariants:
1. **Zero Raw `graph.patch` Calls**: TUI write commands must never directly mutate graph properties. All mutations must pass through `RuntimeCommandIntentRoute` lowering into `OpticDomainActionService`.
2. **Zero Main-Thread I/O**: `DashboardApp.ts` must never invoke synchronous Git packfile or Edict parsing on the main thread.
3. **Pure Unidirectional Flow**: View blocks must consume immutable `BindingSnapshot` structures exclusively.
