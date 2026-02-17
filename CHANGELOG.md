# CHANGELOG

All notable changes to XYPH will be documented in this file.

## [1.0.0-alpha.3] - 2026-02-17

### Added — Milestone 4: SOVEREIGNTY

**Intent node type & actuator command (SOV-001)**
- `intent:` prefix added to schema `PREFIXES`.
- `authorized-by` edge type added to schema `EDGE_TYPES`.
- New `Intent` domain entity: enforces `intent:` ID prefix, title ≥ 5 chars, and `requestedBy` must start with `human.` (agents cannot be sovereign roots — Constitution Art. IV).
- `xyph-actuator intent <id> --title "..." --requested-by human.<name>` command declares a human-signed sovereign Intent node in the graph.
- `xyph-actuator quest` gains optional `--intent <id>` flag to create an `authorized-by` edge linking a Quest to its Intent root.

**Constitutional enforcement — Genealogy of Intent (SOV-002)**
- `RoadmapPort` gains `getOutgoingEdges(nodeId)`, implemented in `WarpRoadmapAdapter` via `graph.neighbors(id, 'outgoing')`.
- New `SovereigntyService`: `checkQuestAncestry(questId)` validates the presence of an `authorized-by` edge to an `intent:` node; `auditBacklog()` scans all BACKLOG quests and returns violations.
- `xyph-actuator quest` now **hard-rejects** if `--intent` is absent (Constitution Art. IV — Genealogy of Intent). Exit 1 with a constitutional violation message.
- New `xyph-actuator audit-sovereignty` command: scans all BACKLOG quests and reports violations with remediation hint.

**Approval gate node type (SOV-003)**
- `approval:` prefix added to schema `PREFIXES`.
- `approves` edge type added to schema `EDGE_TYPES`.
- New `ApprovalGate` entity: enforces `approval:` ID prefix, `requestedBy` must be an agent (`agent.`), `approver` must be a human (`human.`), `resolvedAt ≥ createdAt` when present, trigger must be `CRITICAL_PATH_CHANGE` or `SCOPE_INCREASE_GT_5PCT` (Constitution Art. IV.2).

**Guild Seal cryptographic signing on scrolls (SOV-004)**
- New `GuildSealService`: Ed25519 keypair generation, detached signing, and verification of Scroll payloads.
- Canonical payload: `{ artifactHash, questId, rationale, sealedBy, sealedAt }` hashed with blake3.
- Private keys stored in `trust/<agentId>.sk` (gitignored, mode 0600); public keys registered in `trust/keyring.json`.
- `xyph-actuator seal` now attaches `guild_seal_alg`, `guild_seal_key_id`, `guild_seal_sig`, `sealed_by`, `sealed_at`, and `payload_digest` to every Scroll node. Warns (non-fatal) if no private key found.
- New `xyph-actuator generate-key` command generates and registers a keypair for the active agent.
- Keypair generated and registered for `agent.james` (`did:key:agent.james`).

**Other**
- `trust/*.sk` added to `.gitignore`.
- Declared `intent:SOVEREIGNTY` as the root Intent for the entire project.
- 30 new unit tests (Intent, SovereigntyService, ApprovalGate, GuildSealService). Total: 101 passing.

### Breaking Changes
- `xyph-actuator quest` now **requires** `--intent <id>`. Any quest creation without a sovereign Intent root is rejected with exit code 1.

## [1.0.0-alpha.2] - 2026-02-15

### Changed
- Renamed `Task` entity to `Quest` with `QuestStatus`, `QuestType`, `QuestProps` (Digital Guild terminology).
- `Quest` constructor now enforces invariants: `task:` prefix, title >= 5 chars, finite non-negative hours.
- `RoadmapPort` methods renamed: `getTasks`→`getQuests`, `getTask`→`getQuest`, `upsertTask`→`upsertQuest`.
- `RoadmapPort.addEdge` now uses `EdgeType` union instead of bare `string`.
- Added `tsconfig.test.json` for test-file type-checking.
- `declarations.d.ts`: `executeStream` return type now matches `git-warp`'s expected `StreamResult` interface.

### Fixed
- Merged duplicate `### Added` sections in CHANGELOG.
- Dockerfile: non-root user, `--no-install-recommends`, accurate CMD comment.
- ESLint: added `ignores` for `dist/**` build artifacts.
- Quoted lint glob in `package.json` to prevent shell expansion.
- `declarations.d.ts`: fixed invalid `static` in interface, replaced `any` with `unknown`.
- `coordinator-daemon.ts`: validated `INTERVAL_MS`, added graceful shutdown (SIGINT/SIGTERM), circuit breaker on repeated failures.
- `IngestService`: removed unused `TaskStatus` import, derived checkbox status from regex capture group instead of `line.includes('[x]')`.
- `NormalizeService`: `normalize()` returns array directly instead of no-op `.map()`.
- `CoordinatorService`: dependency injection via constructor, per-task error handling with result accumulation, proper `Task` import instead of inline `import()` type.
- `WarpRoadmapAdapter`: extracted `buildTaskFromProps` with safe runtime type checks, fixed falsy checks on `claimedAt`/`completedAt` timestamps.
- `inspect-graph.ts`: changed `forEach` callback to block body to avoid implicit return.
- `schema.ts`: validate before casting in `validateNodeId` and `validateEdgeType`.
- `xyph-actuator.ts`: centralized `createPatch` helper, normalized default agent ID constant, added `--hours` validation via `InvalidArgumentError`.
- Tests: `beforeEach` mock reset to prevent state leaks, `vi.mocked()` instead of brittle double-cast, added `isClaimed()` tests, expanded `NormalizeService` test coverage, renamed misleading test description.

## [1.0.0-alpha.1] - 2026-02-15

### Added
- **Rebalance Service**: Implemented `RebalanceService` to enforce the 160-hour limit per campaign (Phase 4).
- **CodeRabbit Integration**: Added `.coderabbit.yaml` to enable AI code reviews on all branches, facilitating stacked PR workflows.
- **Triage Service**: Introduced `TriageService` for backlog auditing and linking tasks to human intent (`origin_context`).
- **Task Entity Expansion**: Formalized `originContext` property in the domain model and persistence layer.
- **Orchestration FSM**: Integrated `Ingest` and `Normalize` services into `CoordinatorService` to provide a full pipeline from raw input to graph mutation.
- **Canonical Corpus**: Initialized `docs/canonical/` with 15 foundational specifications (Constitution, Agent Charter, Orchestration Spec, etc.).
- **XYPH Actuator**: Implemented `xyph-actuator.mjs` for Quest management (Initialize, Claim, Seal) using the `git-warp` Node.js API.
- **Graph Schema**: Formalized node/edge taxonomy and runtime validators in `src/schema.js`.
- **Roadmap Bootstrap**: Initialized `xyph-roadmap` with Milestone 1 (BEDROCK) tasks.
- **Squadron Integration**: Formalized Digital Guild principles within the agentic workflow.
- **Infrastructure Patch**: Applied `@mapbox/node-pre-gyp` patch to resolve `DEP0169` warnings in modern Node.js.
- **Inspection Tooling**: Created `src/inspect-graph.js` for deep graph state analysis.

### Changed
- **TS Execution Refinement**: Switched from `ts-node` to `tsx` for CLI execution to resolve `DEP0180` (`fs.Stats`) deprecation warnings in Node 22+.
- **Setup Script Improvements**: Enhanced `scripts/setup-milestone-2.js` with idempotency checks and robust error propagation (non-zero exit codes).
- **Actuator Refinement**: Added ESM shebang to `xyph-actuator.ts` for direct execution.
- **Normalize Service**: Implemented `NormalizeService` for task enrichment and constitutional validation (Phase 2).
- **Ingest Service**: Implemented `IngestService` for parsing Markdown-based task definitions into domain entities (Phase 1 of Orchestration Pipeline).
- **TypeScript Migration**: Full project conversion to strict TypeScript with zero `any` tolerance.
- **Hexagonal Architecture**: Established clean boundaries with `RoadmapPort` and `WarpRoadmapAdapter`.
- **Coordinator Daemon**: Initial implementation of the `CoordinatorService` and heartbeat loop.
- **Dockerized Testing**: Integrated Vitest with a `node:22-slim` Docker environment for isolated verification.
- **Strict Linting**: Configured ESLint with `typescript-eslint` strict rules.
- Refined Actuator `syncWith` logic to use `syncCoverage()` for reliable multi-writer convergence.
