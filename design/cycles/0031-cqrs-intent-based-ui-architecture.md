# 0031: CQRS Intent-Based UI Architecture (Unidirectional Event Streams)

## Cycle Type

Architectural Evolution & TUI Decoupling Cycle

## Status

Proposing Design — Active in the Next-Generation TUI Architecture Roadmap.

## Graph Anchor

- Work item: `task:TUI-031` (CQRS Intent-Based UI Architecture)
- Legend: TUI / AGENTIC BEDROCK (Immutable Event Streams & Domain Intent Admission)

## Why This Cycle Exists

The legacy TUI system (`DashboardApp.ts`) suffers from architectural bloat, mixing UI layout code with synchronous business logic, direct secondary adapter calls, and monolithic graph materialization (`loadOperationalSnapshot()`). This induces UI stutter, dropped terminal keystrokes, and the infamous "stuck at 95%" loading screen stall.

To achieve true zero-hitch 60fps rendering and perfect Hexagonal isolation, we are pivoting the entire TUI to an **Immutable, Unidirectional Event Stream (CQRS)** backed by our native `Intent` and `Optic` domain concepts:

1. **Unidirectional Event Stream (Channels)**: UI components subscribe to immutable event channels (`channel:optics`, `channel:diagnostics`, `channel:metrics`). The events streaming across these channels represent confirmed state changes or incoming causal cones.
2. **Immutability & Sync Integrity**: Events are deeply immutable (`Object.freeze` / TypeScript `readonly`), preventing components from mutating state in-place or causing cross-view synchronization discrepancies.
3. **Strict Separation of Concerns**: The UI functions purely as a reactive render engine ($f(\text{state}) \to \text{UI}$). Zero business logic or storage mechanics exist within the view layer.
4. **Command Pattern as Domain Intents**: When an operator initiates an action (e.g., claiming a task, linking a node, or authorizing a move), the UI constructs a pure, immutable `IntentDescriptor` and submits it to the `IntentBus` (`OpticDomainActionService`).

## Sponsor Actors

### Primary Sponsor Actor

**Systems Architect**

Needs a bulletproof CQRS boundary where the view layer acts as a pure, reactive listener on immutable channels, completely decoupled from business logic and Git storage I/O.

### Secondary Sponsor Actor

**TUI Operator / Autonomous Agent**

Needs a perfectly responsive, 60fps terminal interface with zero rendering hitches, instant intent capture, and absolute worldline sync integrity.

## Outcome Hill

**As a Systems Architect and TUI Operator, I want the TUI to operate as a pure reactive render engine subscribing to immutable event channels and submitting pure `IntentDescriptor` objects, ensuring zero business logic mixing, complete elimination of UI thread I/O, and absolute synchronization integrity.**

## Invariants

This cycle must preserve:
- The custom `bijou` widget styling and TUI layout expectations.
- Complete compatibility with `OpticDomainActionService` intent admission rules.
- 100% passing status for all existing unit and integration tests.

## Scope

### In Scope
- Define `ImmutableEventStream` and `EventChannel` subscriber interfaces.
- Decouple `DashboardApp.ts` from direct snapshot loading, wiring it to subscribe to `channel:optics`.
- Establish the `IntentBus` interface connecting TUI actions directly to `OpticDomainActionService`.
- Refactor TUI event handling to ensure all emitted commands are pure `IntentDescriptor` objects.

### Out of Scope
- Altering the underlying `git-warp` binary storage protocol or CRDT serialization formats.

## Acceptance-Test Plan

### Checkpoint 1: Clean build and lint
1. Running `npm run lint` and `npm run build` must be completely clean with zero errors.

### Checkpoint 2: All tests pass
2. Running `npm run test:local` must succeed with all tests passing.

### Checkpoint 3: Unidirectional Verification
3. Unit tests must verify that UI view components cannot mutate event objects and that all user actions yield valid `IntentDescriptor` payloads.

## Proposed Interface Wiring

```typescript
export interface ImmutableEvent<T = unknown> {
  readonly id: string;
  readonly channel: 'channel:optics' | 'channel:diagnostics' | 'channel:metrics';
  readonly timestamp: number;
  readonly payload: DeepReadonly<T>;
}

export interface IntentBus {
  submitIntent(intent: IntentDescriptor): Promise<void>;
}

export class TuiReactiveCockpit {
  constructor(
    private readonly eventStream: EventStreamSubscriber,
    private readonly intentBus: IntentBus,
  ) {}
}
```

## Playback Questions

1. Is the UI view layer 100% free of business logic and direct Git storage I/O?
2. Are all state updates streaming across immutable channels to prevent component sync discrepancies?
3. Does every interactive UI action successfully resolve into a pure `IntentDescriptor` submitted to the `IntentBus`?

## Exit Criteria

This cycle closes when:
- `DashboardApp` is fully migrated to the unidirectional `EventStreamSubscriber` and `IntentBus` architecture.
- All legacy synchronous graph materialization calls in the view layer are deprecated.
- All tests pass cleanly.
- Design cycle status is updated to completed.
