# CHANGELOG

All notable changes to XYPH will be documented in this file.

## [1.0.0-alpha.1] - 2026-02-15

### Added
- **Orchestration FSM**: Integrated `Ingest` and `Normalize` services into `CoordinatorService` to provide a full pipeline from raw input to graph mutation.
- **Normalize Service**: Implemented `NormalizeService` for task enrichment and constitutional validation (Phase 2).
- **Ingest Service**: Implemented `IngestService` for parsing Markdown-based task definitions into domain entities (Phase 1 of Orchestration Pipeline).
- **TypeScript Migration**: Full project conversion to strict TypeScript with zero `any` tolerance.
- **Hexagonal Architecture**: Established clean boundaries with `RoadmapPort` and `WarpRoadmapAdapter`.
- **Coordinator Daemon**: Initial implementation of the `CoordinatorService` and heartbeat loop.
- **Dockerized Testing**: Integrated Vitest with a `node:22-slim` Docker environment for isolated verification.
- **Strict Linting**: Configured ESLint with `typescript-eslint` strict rules.

### Added
- **Canonical Corpus**: Initialized `docs/canonical/` with 15 foundational specifications (Constitution, Agent Charter, Orchestration Spec, etc.).
- **XYPH Actuator**: Implemented `xyph-actuator.mjs` for Quest management (Initialize, Claim, Seal) using the `git-warp` Node.js API.
- **Graph Schema**: Formalized node/edge taxonomy and runtime validators in `src/schema.js`.
- **Roadmap Bootstrap**: Initialized `xyph-roadmap` with Milestone 1 (BEDROCK) tasks.
- **Squadron Integration**: Formalized Digital Guild principles within the agentic workflow.
- **Infrastructure Patch**: Applied `@mapbox/node-pre-gyp` patch to resolve `DEP0169` warnings in modern Node.js.
- **Inspection Tooling**: Created `src/inspect-graph.js` for deep graph state analysis.

### Changed
- Refined Actuator `syncWith` logic to use `syncCoverage()` for reliable multi-writer convergence.
