# Architectural Topic: TUI CQRS Intent Architecture & Causal Lowering

> [!TIP]
> **DEFINITIVE SYSTEM BLUEPRINT**
> This topic guide establishes the canonical architecture for Xyph's next-generation TUI. It covers the decoupled view layer using Bijou Blocks, unidirectional `ViewDataContract` bindings, command-intent routes, and the transitional command-intent executor seam.

---

## 1. The TUI Tension: Monolithic Bloat vs. 60fps Decoupling

In legacy TUI architectures, view layout logic is frequently coupled with direct database access, raw storage patches, and synchronous graph materialization. In Xyph's legacy `DashboardApp.ts`, this manifested as:
- **Synchronous Snapshot Loading**: Executing `loadOperationalSnapshot()` directly on the UI event loop, freezing terminal rendering and dropping operator keystrokes.
- **Imperative Graph Mutations**: Write commands (e.g., `claimQuest`) directly invoking `graph.patch`, leaking Edict CRDT property knowledge into the view layer.

To achieve uncompromised 60fps rendering, absolute Hexagonal isolation, and strict domain purity, Xyph adopts a pure **CQRS (Command Query Responsibility Segregation) Block Binding Architecture** powered by the current `@flyingrobots/bijou` packages.

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
│  toCommand: (emission) => CommandIntentDescriptor            │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│            Domain Core / Storage (Optic Pure)                │
│  CommandIntentExecutorPort.execute(commandIntentDescriptor)  │
└──────────────────────────────────────────────────────────────┘
```

- **`RuntimeCommandIntentRoute`**: Acts as our explicit Hexagonal translation bridge. It intercepts generic UI emissions (for example, `ui:intent:claim`) and lowers them into concrete `CommandIntentDescriptor` objects.
- **`CommandIntentExecutorPort`**: Receives the descriptor, checks that the descriptor operation matches the expected command operation, and delegates accepted commands to the configured writer or domain action seam.

---

## 3. TUI Command Migration: The Write Command Slices

Following the pioneer implementation of `claimQuest`, Xyph routes the current TUI write commands through `src/tui/bijou/write-cmds.ts` and the command-intent executor seam:
- `claimQuest`
- `promoteQuest`
- `rejectQuest`
- `reopenQuest`
- `commentOnEntity`
- `reviewSubmission`
- `queueAskAiJob`
- `decideCase`
- `adoptSuggestion`
- `dismissSuggestion`
- `supersedeSuggestion`

### Legacy Imperative Anti-Pattern (Deprecated)
```typescript
// LEAK: TUI directly manipulates raw graph CRDT properties or port mutations imperatively
await graph.patch((p) => {
  p.setProperty(questId, 'assigned_to', deps.agentId)
    .setProperty(questId, 'status', 'IN_PROGRESS')
    .setProperty(questId, 'claimed_at', Date.now());
});
```

### Modern CQRS Lowering Bridge (Canonical)
```typescript
import { commandIntent, defineBindingLifecycleOwner, type CommandIntent } from '@flyingrobots/bijou';
import { runtimeCommandIntentRoute, runtimeCommandIntentEmission, type RuntimeCommandIntentRoute } from '@flyingrobots/bijou-tui';

// 1. Pristine UI Intent Declaration
export const claimQuestUiIntent: CommandIntent<{ questId: string }> = commandIntent('ui:intent:claim');

// 2. Translation route to a command-intent descriptor
export const claimQuestIntentRoute: RuntimeCommandIntentRoute<{ questId: string }, CommandIntentDescriptor> = runtimeCommandIntentRoute({
  intent: claimQuestUiIntent,
  toCommand: (emission) => ({
    intentId: `intent:xyph:claimQuest:${generateId()}`,
    suffixTransform: {
      op: 'claimQuest',
      payload: {
        questId: emission.payload.questId,
        agentId: emission.owner?.id ?? 'operator:local',
      },
    },
  }),
});

// 3. Command dispatch via defineBindingLifecycleOwner and the command-intent executor
const owner = defineBindingLifecycleOwner({ id: deps.agentId, kind: 'view', label: deps.agentId });
const emission = runtimeCommandIntentEmission(claimQuestUiIntent, { questId }, { owner });
const descriptor = claimQuestIntentRoute.toCommand(emission);
```

---

## 4. Architectural Verification & Invariants

To maintain absolute system integrity, all future TUI development must abide by the following invariants:
1. **Zero Raw `graph.patch` Calls**: TUI write commands must never directly mutate graph properties. All mutations must pass through `RuntimeCommandIntentRoute` lowering into `CommandIntentExecutorPort`.
2. **Zero Main-Thread I/O**: `DashboardApp.ts` must never invoke synchronous Git packfile or Edict parsing on the main thread.
3. **Pure Unidirectional Flow**: View blocks must consume immutable `BindingSnapshot` structures exclusively.
