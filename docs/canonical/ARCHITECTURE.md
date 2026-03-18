# ARCHITECTURE

## Sovereign Boundary

**XYPH's ontology is sovereign.** XYPH defines the public concepts of
observation, worldlines, comparison, collapse, and lawful transformation.
git-warp provides the versioned graph-state substrate. Alfred-derived
components may be used internally for resilience, transport, audit, auth, or
control-plane plumbing, but they are not part of XYPH's public ontology, API
vocabulary, or type system.

Load-bearing rule: **Observer profiles do not grant authority by existing.**
Observer profiles shape perception. Effective capability is resolved from the
principal, observer profile, policy pack, observation/worldline coordinate, and
the active command family.

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
- **`src/domain/services/`** — Domain logic: `CoordinatorService`, `SubmissionService`, `IntakeService`, `DepAnalysis`, `GuildSealService`, `SovereigntyService`, `IngestService`, `NormalizeService`, `RebalanceService`, the agent-kernel services defined by `AGENT_PROTOCOL.md`, and the sovereign control-plane services such as `ControlPlaneService`, `CapabilityResolverService`, `MutationKernelService`, `RecordService`, and `ExplainService`.
- **`src/domain/models/`** — View models and protocol models, including dashboard snapshots and versioned control-plane JSONL envelopes.
- **`src/ports/`** — Boundary interfaces: `GraphPort`, `RoadmapPort`, `IntakePort`, `SubmissionPort`, `WorkspacePort`, `ControlPlanePort`.
- **`src/infrastructure/adapters/`** — Concrete implementations backed by git-warp and git: `WarpGraphAdapter`, `WarpIntakeAdapter`, `WarpSubmissionAdapter`, `WarpRoadmapAdapter`, `GitWorkspaceAdapter`.
- **`src/infrastructure/GraphContext.ts`** — Shared gateway to the WARP graph. Replaces the old dashboard adapter with `graph.query()` for typed node fetching and frontier-based cache invalidation.
- **`src/tui/`** — TUI (bijou-tui): `DashboardApp.ts` (TEA app), view functions, theme presets, `StylePort`-based styling.
- **`src/validation/`** — Cross-cutting concerns: cryptographic utilities, invariant enforcement.

## Canonical Control Plane

The long-term machine-facing interface is `xyph api`, a versioned JSONL control
plane. The canonical command vocabulary is moving toward:

- `observe`
- `explain`
- `history`
- `diff`
- `fork_worldline`
- `braid_worldlines`
- `compare_worldlines`
- `attest`
- `collapse_worldline`
- `apply`
- `propose`
- `comment`

Current foundation slice:

- implemented now: `observe`
- implemented now: `explain`
- implemented now: `history`
- implemented now: `diff`
- implemented now: `fork_worldline`
- implemented now: `braid_worldlines`
- implemented now: `compare_worldlines`
- implemented now: `apply`
- implemented now: `comment`
- implemented now: `propose`
- implemented now: `attest`
- reserved, not yet implemented: `collapse_worldline`
- reserved, hidden admin/debug concepts: `query`, `rewind_worldline`

Current `observe` projections include a substrate-backed `conflicts` view that
delegates directly to `git-warp`'s published `analyzeConflicts()` API. This is
an intentional boundary: git-warp owns conflict facts, and XYPH exposes them as
observer-facing read data without inventing parallel conflict provenance in its
own domain layer. In the current slice, that projection is tip-only but is now
worldline-aware for canonical derived worldlines: XYPH lowers those reads to
the backing git-warp working-set tip rather than pretending the live frontier
is the only reality.

Current `fork_worldline` behavior is likewise substrate-thin. XYPH now maps the
command onto git-warp working-set creation, preserving XYPH worldline IDs in
the public control plane while recording a separate substrate backing ID for the
working set. In this slice, forking is limited to `worldline:live` plus an
optional tick ceiling that lowers to git-warp's current-frontier Lamport-ceiled
working-set coordinate. Arbitrary historical frontier selection and
derived-from-derived worldline forking remain future substrate work.

That substrate mapping is now materially useful rather than purely declarative.
For canonical derived worldlines backed by git-warp working sets, XYPH routes:

- `observe(graph.summary)` / `observe(worldline.summary)` /
  `observe(entity.detail)` through isolated working-set-aware read graphs, with
  observation coordinates pinned to the working set's visible frontier
- `history` through `patchesForWorkingSet(...)`
- `diff` through working-set-local materialization plus working-set provenance
- `apply` through the same mutation kernel as live writes, lowered into
  `patchWorkingSet(...)`

This keeps the reducer and conflict rules worldline-blind while letting the
visible patch universe vary by worldline. Compatibility projections such as
`briefing`, `context`, `next`, `submissions`, `diagnostics`, and
`prescriptions` still read from the live or isolated graph services until
git-warp exposes the right substrate query surfaces for broader working-set
parity.

`compare_worldlines` now uses that same boundary honestly. XYPH opens an
isolated read graph and delegates to git-warp's published coordinate
comparison surface, then returns a typed XYPH `comparison-artifact` preview
with:

- left/right worldline metadata in XYPH terms
- per-side observation coordinates
- substrate divergence facts carried explicitly instead of re-derived in XYPH

That keeps comparison factual and read-only. Decision, attestation, and future
collapse semantics remain XYPH concerns built on top of this substrate-backed
preview rather than hidden inside it.

`braid_worldlines` is now the thin control-plane mapping for that composition
step. XYPH keeps the public API in worldline terms while delegating the actual
visible-patch-universe math to git-warp’s published braid substrate. Current
behavior:

- targets the effective canonical derived worldline
- pins one or more canonical derived support worldlines as read-only overlays
- accepts optional `readOnly` to freeze the target overlay too
- returns XYPH-first braid metadata plus the substrate backing IDs

That matters because the operation is not ordinary merge or rebase; it changes
the visible patch universe without pretending one line replaced the other.
Because the core materialized projections already lower through working-set
truth, selecting a braided target worldline now exposes those co-present
effects on that surface. The next slice is still responsible for explicit
braid-wide parity and diagnostics across the rest of the control plane.

Existing commands such as `briefing`, `next`, `context`, `submit`, `review`,
and `merge` still exist, but they should be understood as compatibility
projections or wrappers over graph-backed domain services, not the canonical
ontology of the redesign.

## Authority Model

XYPH separates three runtime concerns:

- **Principal**: who is acting
- **Observer profile**: how graph reality is projected
- **Effective capability grant**: what that principal may do, using that
  observer, at that coordinate, under that policy pack

Observer profiles do not contain direct command permissions. They carry
perception defaults such as basis, aperture, diagnostic scope, and comparison
policy defaults. Capability is computed at execution time.

## One Mutation Kernel

`apply` is the canonical mutation path for graph-native transforms. It exposes a
small allowlisted primitive-op vocabulary over git-warp patch sessions:

- `add_node`
- `remove_node`
- `set_node_property`
- `add_edge`
- `remove_edge`
- `set_edge_property`
- `attach_node_content`
- `attach_edge_content`

`collapse_worldline` is not allowed to become a special-case mutation engine.
When implemented, it must lower to a validated mutation plan through the same
mutation, audit, and capability pipeline as `apply`.

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

For historical sovereign-control-plane reads, the graph port may also provide an
isolated read graph. Those reads materialize against an explicit ceiling tick so
historical observation does not mutate or reposition the live frontier.

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

### Historical Read Path (Control Plane → Isolated Graph)
```
xyph api observe/history/diff with at={tick}
  → GraphPort.openIsolatedGraph()
  → syncCoverage()
  → materialize({ ceiling })
  → GraphContext over isolated graph
  → build observation + result
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
- Future TUI, web, and machine-control surfaces should call the same
  graph-backed services rather than inventing parallel mutation paths.

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
- Observer profiles do not grant authority by existing.
- Alfred-derived components may sit behind ports and adapters, but Alfred nouns
  are not part of XYPH's public ontology.
