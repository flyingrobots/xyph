# Substrate Decoupling Boundary Audit

**Date:** 2026-07-01
**Status:** Active audit
**Doctrine:** [GraphQL Optics, Intent Declarations, and the Edict Bridge](../../design/graphql-optics-intents-edict-bridge.md)
**Priority:** Substrate Decoupling & Bedrock Purity

## Verdict

XYPH still leaks git-warp substrate mechanics into application, domain, CLI, and
TUI code.

The root problem is not only bad naming. The root problem is that product code
can still acquire a `WarpCore` through `GraphPort` and then imperatively inspect
or mutate WARP state with `getNodeProps`, `neighbors`, `getEdges`, `worldline`,
`graph.patch`, patch sessions, `_content`, and materialization-sensitive reads.

That violates the new law:

- XYPH product code should read through domain optics.
- XYPH product code should write through domain intents.
- git-warp graph mechanics belong behind infrastructure adapters.
- future Edict/Wesley integration should target the optic/intent contract, not
  current Graph-shaped application code.

## Audit Commands

Inventory was taken against the current dirty worktree with:

```bash
rg -n --glob '*.ts' --glob '!node_modules/**' --glob '!dist/**' \
  "\bGraphPort\b|\bgraphPort\b|\bgetGraph\(|\bgetMutationGraph\(|\bgraph\.patch\(|\bcreatePatchSession\(|\bworldline\(\)|\bgetNodeProps\(|\bgetEdges\(|\bneighbors\(|\bquery\(\)|\bgetStateSnapshot\(|\bmaterialize\b|['_\"]_content['_\"]" \
  src test

rg -n "import type \{ GraphPort \}|GraphPort" src/domain src/cli src/tui src/ports -g '*.ts'

rg -c "GraphPort|getGraph\(|getMutationGraph\(|graph\.patch\(|worldline\(\)|getNodeProps\(|neighbors\(|getEdges\(|query\(\)|getStateSnapshot\(|['_\"]_content['_\"]" \
  src -g '*.ts' | sort
```

## Root Violation: `GraphPort`

`GraphPort` is the primary substrate leak.

Evidence:

- [`src/ports/GraphPort.ts`](../../src/ports/GraphPort.ts) exports `getGraph(): Promise<WarpGraph>`.
- The exported type imports `WarpCore` directly from `@git-stunts/git-warp`.
- The comments promise shared mutable WARP graph lifecycle, eager visibility,
  materialized basis, and isolated graph handles.

Classification: **P0 Hard Violation**

Reason:

`GraphPort` hands app/domain code the bedrock handle. Once a caller has that
handle, every higher-level boundary becomes advisory.

Required direction:

- Replace product-facing `GraphPort` dependencies with generated optic and
  intent contracts.
- Keep WARP lifecycle handles inside infrastructure only.
- Retire `GraphPort` from domain, CLI, and TUI constructors.

## Port Seam Landed: `CausalMutationPort`

Status: landed as a substrate-hiding mutation seam.

Files:

- [`src/ports/CausalMutationPort.ts`](../../src/ports/CausalMutationPort.ts)
- [`src/infrastructure/warp/CausalMutationAdapter.ts`](../../src/infrastructure/warp/CausalMutationAdapter.ts)
- [`src/domain/services/MutationKernelService.ts`](../../src/domain/services/MutationKernelService.ts)

What changed:

- `MutationKernelService` no longer imports `GraphPort`.
- `MutationKernelService` no longer calls `getGraph`, `getMutationGraph`,
  `worldline`, `createPatchSession`, or `projectState`.
- The kernel validates mutation legality against visible causal entities and
  relations from `CausalMutationPort`.
- The WARP adapter owns physical topology reads, strand materialization,
  patch sessions, and WARP patch commits.
- `test/unit/SubstrateBoundary.test.ts` guards the kernel against regressing
  back to substrate access.

Remaining debt:

- Some dirty transitional domain services still construct
  `WarpCausalMutationAdapter` as a fallback because their composition has not
  yet been moved fully to the CLI/app runtime boundary.
- The port still carries legacy `add_node`/`add_edge` operation names so
  existing callers can move first; a later slice should rename these to
  entity/relation language once the call sites are smaller.

## App API Seam Landed: `XYPHReader` / `XYPHWriter`

Status: first write path migrated.

Files:

- [`src/ports/XYPHReader.ts`](../../src/ports/XYPHReader.ts)
- [`src/ports/XYPHWriter.ts`](../../src/ports/XYPHWriter.ts)
- [`src/writings/RecordComment.ts`](../../src/writings/RecordComment.ts)
- [`src/infrastructure/warp/WarpXYPHWriterAdapter.ts`](../../src/infrastructure/warp/WarpXYPHWriterAdapter.ts)

What changed:

- App code can now depend on `XYPHWriter` instead of one-off intent ports.
- `RecordComment` is the first named write declaration.
- CLI `show comment`, TUI `commentOnEntity`, and agent comment execution now use
  `writer.write(RecordComment(...))`.
- `RecordCommentIntentPort` remains as an infrastructure compatibility adapter
  behind `WarpXYPHWriterAdapter`.

Required next direction:

- Add `QuestDetailReading` as the first `XYPHReader` declaration.
- Move `QuestReadPort`/`ObservationPort` call sites behind `reader.read(...)`
  where the read is app-facing.
- Keep `Optic` as compiler/declaration vocabulary and `Reading` as application
  vocabulary.

## P0: Domain Services Owning Graph Handles

Files with domain/service graph-shaped access:

- [`src/domain/services/AgentActionService.ts`](../../src/domain/services/AgentActionService.ts)
- [`src/domain/services/ControlPlaneService.ts`](../../src/domain/services/ControlPlaneService.ts)
- [`src/domain/services/MutationKernelService.ts`](../../src/domain/services/MutationKernelService.ts)
- [`src/domain/services/RecordService.ts`](../../src/domain/services/RecordService.ts)
- [`src/domain/services/AgentBriefingService.ts`](../../src/domain/services/AgentBriefingService.ts)
- [`src/domain/services/AgentContextService.ts`](../../src/domain/services/AgentContextService.ts)
- [`src/domain/services/DoctorService.ts`](../../src/domain/services/DoctorService.ts)

Representative evidence:

- `RecordService` imports `GraphPort`, calls `getMutationGraph`, validates
  existence with `graph.worldline().hasNode`, reads props with
  `graph.worldline().getNodeProps`, scans edges with `getEdges`, and mutates
  with `graph.patch`.
- `AgentActionService` imports `GraphPort`, uses `getMutationGraph`, calls
  `graph.patch`, opens patch sessions, and reads `_content` from node props.
- `ControlPlaneService` imports `GraphPort`, constructs observed graph facades,
  reads `_content`, and opens graph handles across many control-plane paths.
- `MutationKernelService` imports `GraphPort` and treats graph nodes/edges as
  mutation preflight state.

Classification: **P0 Hard Violation**

Reason:

Domain services should express lawful business actions and read decisions. They
should not patch WARP directly, inspect node properties, or reason over edge
families as substrate primitives.

Required direction:

- Convert mutation-heavy service methods into declared domain intents.
- Convert read-heavy service methods into declared domain optics.
- Move WARP lowering into infrastructure adapters generated or bound from the
  optic/intent contract.

## P0: CLI Commands Performing Raw Graph Mutations

CLI files with direct graph access:

- [`src/cli/commands/traceability.ts`](../../src/cli/commands/traceability.ts)
- [`src/cli/commands/suggestions.ts`](../../src/cli/commands/suggestions.ts)
- [`src/cli/commands/intake.ts`](../../src/cli/commands/intake.ts)
- [`src/cli/commands/link.ts`](../../src/cli/commands/link.ts)
- [`src/cli/commands/dashboard.ts`](../../src/cli/commands/dashboard.ts)
- [`src/cli/commands/show.ts`](../../src/cli/commands/show.ts)
- [`src/cli/commands/ingest.ts`](../../src/cli/commands/ingest.ts)
- [`src/cli/commands/sovereignty.ts`](../../src/cli/commands/sovereignty.ts)
- [`src/cli/commands/analyze.ts`](../../src/cli/commands/analyze.ts)
- [`src/cli/commands/artifact.ts`](../../src/cli/commands/artifact.ts)
- [`src/cli/commands/coordination.ts`](../../src/cli/commands/coordination.ts)
- [`src/cli/commands/wizards.ts`](../../src/cli/commands/wizards.ts)
- [`src/cli/context.ts`](../../src/cli/context.ts)

Representative evidence:

- `traceability.ts` repeatedly calls `ctx.graphPort.getGraph()` and
  `graph.patch`.
- `link.ts` calls `ctx.graphPort.getGraph()`, reads `graph.neighbors`, and
  patches edges directly.
- `show.ts` opens the graph and reads `_content` through node props.
- `intake.ts`, `dashboard.ts`, `suggestions.ts`, `ingest.ts`, `sovereignty.ts`,
  and `wizards.ts` still construct WARP mutations in command handlers.
- `cli/context.ts` exposes callback-style command helpers that patch WARP
  directly.

Classification: **P0 Hard Violation**

Reason:

CLI commands are product entry points. They should construct named intents or
invoke named optics. A command handler should not know whether the backing store
is git-warp, Edict, or a future adapter.

Required direction:

- Command handlers call generated `intents.*` and `optics.*` contracts.
- Validation moves into lawpack-backed intent admission.
- Graph-shaped fallback blocks are deleted once a command migrates.

## P1: TUI Runtime Reaching Through to Graph State

TUI files with direct graph-shaped access:

- [`src/tui/bijou/DashboardApp.ts`](../../src/tui/bijou/DashboardApp.ts)
- [`src/tui/bijou/write-cmds.ts`](../../src/tui/bijou/write-cmds.ts)
- [`src/tui/bijou/syncWorker.ts`](../../src/tui/bijou/syncWorker.ts)

Representative evidence:

- `DashboardApp.ts` imports `GraphPort`, calls `deps.graphPort.getGraph()`, uses
  `syncCoverage`, `watch`, and graph metadata.
- `write-cmds.ts` imports `GraphPort`, reads node props through
  `graph.worldline().getNodeProps`, and patches directly in UI action paths.
- `syncWorker.ts` directly opens `WarpGraphAdapter` and calls `syncCoverage`.

Classification: **P1 Product Boundary Violation**

Reason:

The TUI should render immutable binding frames and emit runtime command intents.
It should not directly synchronize or mutate WARP graph handles from UI code.

Required direction:

- Keep sync/watch mechanics behind an application runtime port.
- Route all TUI write commands through generated domain intents.
- Route all TUI reads through generated view optics or dashboard read ports.

## P1: Omnibus Projection Compatibility Island

Primary file:

- [`src/infrastructure/ObservedGraphProjection.ts`](../../src/infrastructure/ObservedGraphProjection.ts)

Representative evidence:

- Broad `graph.query().match('*')` and many family queries.
- Explicit `getStateSnapshot` usage.
- Internal `getNodeProps`, `neighbors`, `query`, `_content`, and fake
  `GraphPort` shims.
- Large multi-domain read model assembly in one infrastructure file.

Classification: **P1 Temporary Compatibility**

Reason:

This code lives in infrastructure, so it is less severe than domain/CLI/TUI
leaks. But it is still the largest compatibility island and reinforces the
omnibus graph reconstruction model that caused the 95% loading pathology.

Required direction:

- Do not grow this file.
- Replace it slice by slice with named optics.
- Treat every new product read as ineligible for this bridge unless explicitly
  marked temporary.

## P2: Infrastructure Adapters Still Using GraphPort as Their Constructor API

Representative files:

- [`src/infrastructure/adapters/WarpRoadmapAdapter.ts`](../../src/infrastructure/adapters/WarpRoadmapAdapter.ts)
- [`src/infrastructure/adapters/WarpIntakeAdapter.ts`](../../src/infrastructure/adapters/WarpIntakeAdapter.ts)
- [`src/infrastructure/adapters/WarpSubmissionAdapter.ts`](../../src/infrastructure/adapters/WarpSubmissionAdapter.ts)
- [`src/infrastructure/adapters/WarpObservationAdapter.ts`](../../src/infrastructure/adapters/WarpObservationAdapter.ts)
- [`src/infrastructure/warp/optics/WarpQuestReadAdapter.ts`](../../src/infrastructure/warp/optics/WarpQuestReadAdapter.ts)
- [`src/infrastructure/warp/optics/WarpSubmissionReadAdapter.ts`](../../src/infrastructure/warp/optics/WarpSubmissionReadAdapter.ts)
- [`src/infrastructure/warp/optics/WarpCampaignPolicyReadAdapter.ts`](../../src/infrastructure/warp/optics/WarpCampaignPolicyReadAdapter.ts)

Classification: **P2 Allowed Boundary, Bad Transitional Shape**

Reason:

Infrastructure adapters are allowed to speak git-warp. The remaining smell is
that they expose the old `GraphPort` shape instead of implementing generated
optic/intent lowering contracts.

Required direction:

- Keep WARP mechanics here for now.
- Rename/reframe these as generated optic/intent adapters as migrations land.
- Avoid letting app code construct them directly when a domain contract exists.

## P2: Product Read Ports Still Expose Graph-Like Primitives

Representative file:

- [`src/ports/ObservationPort.ts`](../../src/ports/ObservationPort.ts)

Representative risk:

- `ObservationSession` still exposes `queryNodes`, `getNodeProps`, `neighbors`,
  and `hasNode`.

Classification: **P2 Transitional Read Boundary**

Reason:

This is better than exposing `WarpCore`, but still too substrate-shaped for
normal product reads. It is a halfway house between raw graph access and named
optics.

Required direction:

- Existing targeted read services may use it while migrating.
- New product reads should be named optics.
- Retire primitive read methods from normal product call sites as GraphQL optic
  contracts land.

## P3: Tests Encode Old Substrate Expectations

Test fixtures and integration tests still construct graph ports, patch WARP
directly, or assert materialization behavior.

Representative files:

- [`test/helpers/ports.ts`](../../test/helpers/ports.ts)
- [`test/helpers/cliContext.ts`](../../test/helpers/cliContext.ts)
- `test/integration/*GraphContext*.test.ts`
- `test/integration/*Warp*Adapter.test.ts`
- `test/unit/GraphContextReadPath.test.ts`

Classification: **P3 Test Harness Debt**

Reason:

Adapter integration tests may still seed WARP directly. Product tests should move
toward optic/intent fixtures.

Required direction:

- Preserve adapter integration tests where they verify WARP lowering.
- Rewrite product tests around generated optic/intent contracts.
- Delete GraphContext-era test names as related code is retired.

## First Migration Slices

### Slice 1: `recordComment` intent

Why first:

- Small, concrete write path.
- Currently leaks through `RecordService`, `AgentActionService`, CLI `show`,
  and TUI write commands.
- Establishes content handling without `_content` inspection in app code.

Deliverables:

- `src/intents/recordComment.graphql`
- lawpack directive entry for `xyph.comment.record`
- generated or hand-bridged TypeScript intent contract
- WARP lowering adapter hidden in infrastructure
- CLI/TUI/domain call sites moved off `GraphPort`

Status:

- Landed as a hand-bridged intent slice.
- Added `RecordCommentIntentPort` and `WarpRecordCommentIntentAdapter`.
- Added `recordComment.graphql` plus the `xyph.comment.record` lawpack entry.
- Moved CLI `show comment`, TUI `commentOnEntity`, and agent comment execution
  onto `XYPHWriter.write(RecordComment(...))`.
- Removed substrate existence checks from agent comment validation; target and
  reply admission now happens in the intent adapter.
- Added `test/unit/SubstrateBoundary.test.ts` so migrated comment validation and
  write bodies cannot reintroduce `GraphPort`, `getGraph`, `worldline`,
  `getNodeProps`, `_content`, or `graph.patch`.

Remaining debt:

- `RecordService.createComment` keeps a compatibility fallback until all legacy
  callers are migrated.
- The WARP adapter still performs the physical lowering; that is allowed only
  behind infrastructure while Wesley-generated bindings are not available.
- Other record writes still use `RecordService` and remain future intent slices.

Verification on this slice:

- `npm run lint`: pass.
- `npm run build -- --pretty false`: pass.
- Focused unit/projection set: pass
  (`SubstrateBoundary`, `ShowCommands`, `AgentActionService`, `DashboardApp`,
  `GraphContextReadPath`, `WarpDashboardReadAdapter`, `ControlPlaneService`).
- Full `npm run test:local`: still red, with failures concentrated in legacy
  integration paths and stale test doubles that call live WARP read/query APIs
  without an explicit reading basis.

### Slice 2: `questDetail` optic

Why second:

- Small, concrete read path.
- Replaces a common `getNodeProps` plus `neighbors` shape.
- Creates a pattern for domain view reads without omnibus projection.

Deliverables:

- `src/optics/questDetail.graphql`
- lawpack directive entry for `dashboard.view.questDetail`
- generated or hand-bridged TypeScript optic contract
- WARP read adapter hidden in infrastructure
- direct entity-detail graph primitive calls removed for this path

### Slice 3: `promoteQuest` intent

Why third:

- Exercises authority, intent lineage, and campaign linkage law.
- Replaces direct CLI/TUI promotion mutations.
- Validates Wesley/lawpack admission posture.

Deliverables:

- `src/intents/promoteQuest.graphql`
- lawpack directive entry for `xyph.quest.promote`
- CLI `intake promote` and wizard promotion paths moved to the intent contract
- no direct `graph.patch` in promoted command paths

### Slice 4: `reviewPage` optic

Why fourth:

- High-value product read.
- Already conceptually observer-backed.
- Helps drain `ObservedGraphProjection` without waiting for a full dashboard
  rewrite.

Deliverables:

- `src/optics/reviewPage.graphql`
- lawpack directive entry for `dashboard.view.review`
- adapter implements only the view cone required by the operation
- no broad graph snapshot for review-page reads

## Merge Gate For The Purge

A migrated slice is complete only when:

1. product code imports the generated optic/intent contract,
2. product code does not import `GraphPort`,
3. product code does not call `getGraph`, `graph.patch`, `getNodeProps`,
   `neighbors`, `getEdges`, `worldline`, or inspect `_content`,
4. WARP lowering is confined to infrastructure,
5. tests assert the optic/intent behavior, not raw graph implementation details,
6. `npm run build`, `npm run lint`, and relevant tests are clean.

## Standing Rule

Do not polish Graph-shaped application code unless it is the shortest path to
deleting that Graph shape.
