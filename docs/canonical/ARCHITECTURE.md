# ARCHITECTURE

## Hexagonal Architecture (Ports & Adapters)

```
  Driving Adapters              Domain Core               Driven Adapters
 ┌──────────────┐        ┌───────────────────┐        ┌──────────────────┐
 │ xyph-actuator│───────▶│  domain/entities  │        │ WarpGraphAdapter │
 │  (CLI)       │        │  domain/services  │◀──────▶│ WarpIntakeAdapter│
 ├──────────────┤        │  domain/models    │  ports  │ WarpSubmission..│
 │xyph-dashboard│───────▶│                   │◀──────▶│ WarpRoadmap...  │
 │  (TUI/TEA)   │        └───────────────────┘        │ GitWorkspace... │
 ├──────────────┤                                     └──────────────────┘
 │ coordinator  │
 │  (daemon)    │
 └──────────────┘
```

![Hexagonal architecture](../diagrams/hexagonal-architecture.svg)

### Layers

- **`src/domain/entities/`** — Core business objects: `Quest`, `Intent`, `Submission`, `ApprovalGate`, `Orchestration`.
- **`src/domain/services/`** — Domain logic: `CoordinatorService`, `SubmissionService`, `IntakeService`, `DepAnalysis`, `GuildSealService`, `SovereigntyService`, `IngestService`, `NormalizeService`, `RebalanceService`, and the agent-kernel services defined by `AGENT_PROTOCOL.md`.
- **`src/domain/models/`** — View models for the TUI dashboard (`dashboard.ts`).
- **`src/ports/`** — Boundary interfaces: `GraphPort`, `RoadmapPort`, `IntakePort`, `SubmissionPort`, `WorkspacePort`.
- **`src/infrastructure/adapters/`** — Concrete implementations backed by git-warp and git: `WarpGraphAdapter`, `WarpIntakeAdapter`, `WarpSubmissionAdapter`, `WarpRoadmapAdapter`, `GitWorkspaceAdapter`.
- **`src/infrastructure/GraphContext.ts`** — Shared gateway to the WARP graph. Replaces the old dashboard adapter with `graph.query()` for typed node fetching and frontier-based cache invalidation.
- **`src/tui/`** — TUI (bijou-tui): `DashboardApp.ts` (TEA app), view functions, theme presets, `StylePort`-based styling.
- **`src/validation/`** — Cross-cutting concerns: cryptographic utilities, invariant enforcement.

## Shared Graph Architecture

One `WarpGraph` instance per process, managed by `GraphPort` / `WarpGraphAdapter`:

```
                     GraphPort (singleton)
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        IntakeAdapter  SubmissionAdapter  GraphContext
              │            │            │
              └────────────┴────────────┘
                    graph.patch(...)
```

- All adapters receive `GraphPort` via DI and share the same underlying `WarpGraph`.
- Writes via `graph.patch()` are immediately visible to reads (`autoMaterialize: true`).
- `GraphContext` builds snapshots by querying the graph, with frontier-key caching to skip re-materialization when nothing changed.
- `invalidateCache()` clears only `GraphContext`'s own state — never resets the shared graph.

## Data Flow

### Write Path (CLI → Graph)
```
xyph-actuator command → adapter.method() → graph.patch(p => { ... }) → WARP graph
```

### Read Path (Graph → TUI)
```
GraphContext.fetchSnapshot()
  → syncCoverage() (discover external writes)
  → frontier key check (cache hit? return cached)
  → materialize() → query() → build snapshot → cache
```

### Submission Lifecycle
```
submit → patchset → review → revise → approve → merge/close
                                                    │
                                            auto-seal quest DONE
```

### Agent-Native Lifecycle
```
briefing → next → context → act → handoff
                     │
                     └→ submit/review/seal/merge (when the same gates pass)
```

- `show` remains general entity inspection.
- `context` is the action-oriented work packet.
- `act` wraps routine mutations but must still reuse readiness, submission,
  sovereignty, and settlement gates.
- Future TUI and MCP surfaces should call the same agent-kernel services rather
  than inventing parallel mutation paths.

## Key Services

| Service | Responsibility |
|---------|---------------|
| `CoordinatorService` | Orchestration pipeline: ingest → normalize → rebalance → emit |
| `SubmissionService` | PR-like workflow validation (submit, revise, review, merge, close) |
| `IntakeService` | INBOX → BACKLOG promotion with sovereignty checks |
| `DepAnalysis` | Frontier detection, critical path DP over dependency DAG |
| `GuildSealService` | Ed25519 signing for Project Scrolls |
| `SovereigntyService` | Genealogy of Intent audit (Constitution Art. IV) |
| `AgentBriefingService` | Session-start orientation document for agents |
| `AgentRecommender` | Ranked next-action candidates for agent work |
| `AgentActionValidator` / `AgentActionService` | Policy-bounded action kernel over routine CLI mutations |

## Graph Node Types

| Type | Prefix | Description |
|------|--------|-------------|
| `task` | `task:` | Quest — unit of work |
| `intent` | `intent:` | Sovereign human Intent — causal root |
| `campaign` | `campaign:` / `milestone:` | Grouping container |
| `scroll` | `artifact:` | Completion artifact with Guild Seal |
| `submission` | `submission:` | PR-like review submission |
| `patchset` | `patchset:` | Revision within a submission |
| `review` | `review:` | Verdict on a patchset |
| `decision` | `decision:` | Merge/close terminal action |
| `approval` | `approval:` | Approval gate (critical path changes) |

## Dependency Law

- Domain services depend only on ports (interfaces), never on adapters.
- Adapters depend on ports + infrastructure libraries (git-warp, git).
- TUI components depend on domain models, never on adapters directly.
- `GraphContext` is the only component that bridges infrastructure and presentation.

## Boundary Rules

- All mutations go through `graph.patch()` — no raw patch sessions.
- Every Quest must trace lineage to a sovereign human Intent (Constitution Art. IV).
- LLMs can propose transformations but cannot commit mutations without agent identity.
- Storage adapters are replaceable; port contracts are not.
