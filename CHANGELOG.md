# CHANGELOG

All notable changes to XYPH will be documented in this file.

## [1.0.0-alpha.2] - 2026-02-15

### Added
- **Patch Validation Test Matrix**: 31-test suite systematically covering all 13 patch invariants via single-fault mutation of a golden fixture.
- **Machine Error Codes**: `InvariantCode` enum and `InvariantError` interface for stable, machine-assertable validation errors (replaces raw strings).
- **Ed25519 Signature Verification**: Full detached-signature pipeline with Blake3 payload digest and keyring-based key resolution.
- **Golden Fixture Generator**: Deterministic `create-fixture.ts` with lineage metadata (schemaHash, keyFingerprint, generatorVersion).
- **Test Helpers**: Reusable `resignPatch`, `clonePatch`, `buildTwoOpPatch`, `buildLinkDependencyOp`, and `assertInvariantFail` utilities.
- **Schema Boundary Tests**: Regex boundary validation for `signature.keyId` and `signature.sig` patterns.

### Changed
- Renamed `Task` entity to `Quest` with `QuestStatus`, `QuestType`, `QuestProps` (Digital Guild terminology).
- `Quest` constructor now enforces invariants: `task:` prefix, title >= 5 chars, finite non-negative hours.
- `RoadmapPort` methods renamed: `getTasks`→`getQuests`, `getTask`→`getQuest`, `upsertTask`→`upsertQuest`.
- `RoadmapPort.addEdge` now uses `EdgeType` union instead of bare `string`.
- Added `tsconfig.test.json` for test-file type-checking.
- `declarations.d.ts`: `executeStream` return type now matches `git-warp`'s expected `StreamResult` interface.
- **Validator Error Format**: `validatePatchOps` now returns `InvariantError[]` with `{ code, message }` instead of raw strings.
- **`ValidateResult` Exported**: Type is now exported for use in test assertions.

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
- **Schema `signature.keyId`**: Pattern now accepts both `KEY-` and `did:key:z6` formats.
- **Schema `signature.sig`**: Changed from base64 to hex pattern (`^[0-9a-fA-F]{128}$`).
- **Schema `milestoneEntity`**: Added optional `schemaVersion` property with tight `^v\d+\.\d+$` pattern.
- **Schema `baseOp`**: Added `edge` and `revertsOpId` as optional properties to support `additionalProperties: false` with allOf composition.
- **AJV Strict Mode**: Added `type: "object"` annotations to all `if`/`then`/nested sub-schemas across the operation definition (root allOf + 9 conditional blocks).

## [1.0.0-alpha.1] - 2026-02-15

### Added
- **Orchestration Spec v1.0**: Integrated the definitive FSM for the Planning Compiler (`INGEST -> ... -> APPLY`).
- **Apply Transaction Spec**: Formalized atomicity, optimistic concurrency, and rollback semantics for graph mutations.
- **Audit Event Schema**: Introduced a strict JSON schema for pipeline transition audit records.
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
