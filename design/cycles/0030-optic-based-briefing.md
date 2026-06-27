# 0030: Optic-Based Briefing (Phase 1 Evolution)

## Cycle Type

Refactoring & Architectural Alignment cycle

## Status

Proposing Design — Active in Phase 1 of the Bounded Optics evolution roadmap.

## Graph Anchor

- Work item: `task:TRC-012` (Phase 1: Optic-Based Briefing)
- Legend: TRACEABILITY / AGENTIC BEDROCK (Optic-based bounded state access)

## Why This Cycle Exists

Per `docs/topics/git-warp-evolution/README.md` (Shift I: From Monolithic Materialization to Bounded Optics) and `TS_STANDARDS.md` (Rule 2: Deterministic Architecture), application code must never interact with raw graph-like data structures or absorb the overhead of a monolithic `GraphSnapshot`.

Currently, `AgentBriefingService` retrieves a full `GraphSnapshot` via `OperationalReadPort`. As the graph expands to thousands of nodes, this pattern creates severe memory bloat and violates Hexagonal architecture principles.

The underlying infrastructure adapters for Quest Optics (`WarpQuestReadAdapter`) and their ports (`QuestReadPort`) are already implemented and tested. This cycle bridges the final chasm by refactoring `AgentBriefingService` to consume `QuestReadPort` for its work summaries and briefing candidates, replacing monolithic materialization with targeted causal cone queries ($D(Q)$).

## Sponsor Actors

### Primary Sponsor Actor

**Autonomous Agent**

Needs a lightweight, highly deterministic briefing packet that loads only the causal cone of relevant tasks, without paying the memory and latency cost of materializing the entire worldline graph.

### Secondary Sponsor Actor

**Systems Architect**

Needs absolute hexagonal purity, ensuring domain services interact exclusively with typed ports (`QuestReadPort`) rather than monolithic infrastructure projections.

## Outcome Hill

**As an autonomous agent, I want `AgentBriefingService` to fetch task causal cones via `QuestReadPort` instead of loading a monolithic `GraphSnapshot`, ensuring bounded memory usage and strict hexagonal isolation while maintaining 100% behavioral parity in CLI command outputs.**

## Invariants

This cycle must preserve:
- The public CLI command syntax and JSON/text output formats for `xyph briefing` and `xyph next`.
- The ranking and sorting algorithms for `AgentNextCandidate` selection.
- 100% passing status for all existing unit and integration tests.

## Scope

### In Scope
- Inject `QuestReadPort` into `AgentBriefingService` constructor (alongside or replacing legacy `OperationalReadPort` where appropriate).
- Update `AgentBriefingService.ts` methods (`buildBriefing`, `next`, `buildWorkSummaries`) to query `QuestReadPort.getQuestCone(id)` for target quests.
- Refactor `src/cli/commands/agent.ts` and `src/cli/context.ts` to supply `WarpQuestReadAdapter` to `AgentBriefingService`.
- Refactor `test/unit/AgentBriefingService.test.ts` to provide a test double for `QuestReadPort`.

### Out of Scope
- Phase 2 (Optic-Based Submissions) and Phase 3 (Optic-Based Governance), which will be addressed in subsequent cycles.
- Altering the underlying CRDT storage or `git-warp` binary bindings.

## Acceptance-Test Plan

### Checkpoint 1: Clean build and lint
1. Running `npm run lint` and `npm run build` must be completely clean with zero errors.

### Checkpoint 2: All tests pass
2. Running `npm run test:local` must succeed with all tests passing.

### Checkpoint 3: CLI Verification
3. Executing the agent briefing and next commands:
   ```bash
   npx tsx xyph.ts briefing
   npx tsx xyph.ts next
   ```
   Must successfully construct the briefing packet and action candidates via `QuestReadPort`.

## Proposed Interface Wiring

```typescript
export class AgentBriefingService {
  constructor(
    graphPort: GraphPort,
    roadmap: RoadmapQueryPort,
    private readonly agentId: string,
    private readonly readPort: OperationalReadPort,
    private readonly questReadPort: QuestReadPort,
    doctor?: Pick<DoctorService, 'run'>,
  ) { ... }
}
```

## Playback Questions

1. Did we successfully eliminate `GraphSnapshot` dependency in `AgentBriefingService` for quest causal cone evaluation?
2. Are all domain services strictly isolated from raw graph data structures?
3. Do all unit and integration tests pass green under the new optic boundary?

## Exit Criteria

This cycle closes when:
- `AgentBriefingService` is fully decoupled from monolithic quest materialization in favor of `QuestReadPort`.
- CLI context wiring is updated to inject `WarpQuestReadAdapter`.
- All tests pass cleanly.
- Design cycle status is updated to completed.
