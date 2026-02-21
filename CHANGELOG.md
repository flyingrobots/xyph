# CHANGELOG

All notable changes to XYPH will be documented in this file.

## [1.0.0-alpha.5] - 2026-02-20

**Milestone 5: WARP Dashboard TUI Overhaul**

### Added

**Landing Screen (TUI-001)**
- New `LandingView` component displayed on startup before the main dashboard.
- Shows a randomly selected compact ASCII logo (logos 2, 3, 7, 8, 9, 10 — ≤15 lines each).
- Stats panel: ASCII progress bar (`█░` per-quest completion), current active milestone, next 3 BACKLOG/PLANNED quests.
- Footer: copyright + GitHub link. Hint: `any key to continue · q to quit`.
- `xyph-dashboard.tsx` reads logo file at launch via `readFileSync`; falls back to `'XYPH'` on error.

**Help Modal (TUI-002)**
- New `HelpModal` component: full-screen cyan border overlay accessible from any view via `?`.
- Contains XYPH glossary (Quest, Intent, Campaign, Scroll, Seal, Guild, WARP) and complete key bindings table.
- Closes on `Esc` or `?`.

**Quest Detail Panel (TUI-003)**
- New reusable `QuestDetailPanel` component showing full quest metadata: ID, title, status (colored), hours, agent, campaign (with title lookup), intent (with title lookup), scroll ✓, completedAt, suggestedBy/At, rejection history, reopen history.
- Used by RoadmapView and AllNodesView detail modals.

**RoadmapView: Fold/Unfold + Detail Modal (TUI-004)**
- Unified `selectedVIdx` navigates both campaign headers and quest rows with `↑↓`.
- `Space` on a campaign header folds/unfolds that milestone; header shows `▶` (folded) or `▼` (expanded).
- `Space` on a quest opens a full-screen `QuestDetailPanel` modal; `Esc` closes it.

**AllNodesView: Quest Selection + Detail Modal (TUI-006)**
- `↑↓` now navigates through quest rows only (other node types are display-only).
- `Space` on a selected quest opens a full-screen `QuestDetailPanel` modal; `Esc` closes it.
- Status indicator text updated to include quest position and `Space: quest detail` hint.

**InboxView: Gmail-Style Rework (TUI-007)**
- Replaced fixed `DETAIL_LINES = 10` constant with proportional 40%/60% split: 40% list, 60% detail.
- List rows enriched: `▶` indicator, ID, title, suggestedBy, date, `↩` reopened marker.
- Detail pane always visible (no toggle needed); shows full inbox lifecycle fields.

**Logo Loader + XYPH Wordmark (TUI-008)**
- New `src/tui/logo-loader.ts` utility module: `selectLogoSize()` picks small/medium/large based on terminal dimensions; `loadRandomLogo()` reads `.txt` files from the reorganized `logos/{family}/{size}/` directory structure, trims leading and trailing blank lines, and falls back to plain `'XYPH'` on error.
- Dimension-aware logo selection: logos are filtered by actual width/height against terminal constraints before random pick. If nothing in the preferred size fits, cascades down (large → medium → small) automatically.
- XYPH wordmark rendered in the upper-right corner of the dashboard header (dimmed). Hidden on narrow terminals (< 50 cols).
- All four views (`RoadmapView`, `LineageView`, `AllNodesView`, `InboxView`) accept an optional `chromeLines` prop computed from actual header height, replacing the hardcoded `CHROME_LINES = 4` constant.

### Fixed

**LineageView: INBOX Bug Fix + Selection (TUI-005)**
- INBOX quests no longer appear in the orphan ("sovereignty violation") list — they haven't been promoted yet and genuinely lack an intent.
- Added `selectedVIdx` state with `▶` indicator highlighting the selected quest row.

**TUI layout stability (TUI-009)**
- Landing page logo centered as a single block instead of per-line centering — multi-width ASCII art lines no longer scatter horizontally.
- Dashboard header uses `alignItems="flex-start"` and splits tab labels / hint text onto separate rows — wordmark position is now stable across all views.
- LineageView intent-header, scroll-sub, and orphan rows now truncate long text to prevent terminal line wrapping that pushed the header off-screen.
- Quest detail modal (RoadmapView, AllNodesView) renders inside a fixed-height wrapper matching the normal list height — opening/closing the modal no longer causes layout shifts.

**Lint compliance — 28 errors resolved**
- Replaced `Array<T>` with `T[]` syntax across 5 files (dashboard.ts, CoordinatorService.ts, GuildSealService.ts, WarpRoadmapAdapter.ts, RoadmapPort.ts).
- Converted `OrchestrationFSM` from static-only class to exported const object with standalone functions (`no-extraneous-class`).
- Removed `as any` casts: ed25519 `hashes.sha512` polyfill now uses typed API directly; `loadKeyring` uses proper `Record<string, unknown>` narrowing instead of `as any`; ajv-formats/ajv-errors use typed CJS interop pattern.
- Replaced non-null assertions (`!`) with proper guards in `validatePatchOps.ts` array access and `crypto.ts` canonicalize.
- Added missing return types on 4 functions (crypto.ts `sha512`, signPatchFixture.ts `sha512`/`generateTestKeypair`, validatePatchOps.ts CLI IIFE).
- Removed redundant type annotation (`no-inferrable-types`) in RebalanceService constructor.
- Removed stale `eslint-disable no-console` directive from validatePatchOps.ts.
- Added "own every failure" policy to CLAUDE.md — agents must fix broken things they encounter, never dismiss errors as pre-existing.

**Code review — 5 CodeRabbit findings resolved**
- *Bug*: `OrchestrationFSM.transitionToNormalize` `eventId` now uses injected `context.clock` (`now`) instead of `new Date()`, fixing non-deterministic date fragments under frozen-time test scenarios.
- *Nit*: minimatch override tightened from `>=10.2.1` to `^10.2.1` — prevents accidental major version jumps.
- *Nit*: `AjvPlugin` type widened to accept optional options arg and return `Ajv` instance (matches actual ajv-formats/ajv-errors Plugin signature).
- *Nit*: `sha512` polyfill exported from `crypto.ts` and imported in `signPatchFixture.ts` — eliminates copy-paste duplication and redundant `createHash` import.
- *Nit*: `computeDigest` parameter narrowed from `Record<string, unknown>` to `Record<string, Json>` — removes unsafe `as Json` cast, surfacing type constraint at call site.

### Changed

**README aligned with canonical documentation**
- Replaced "Causal Operating System for Agentic Orchestration" tagline with "The Planning Compiler for Agentic Coordination" per VISION_NORTH_STAR.md.
- Rewrote "How XYPH Works (Part I)" — removed informal GitHub comparison, added the Planning Compiler paradigm (Source → IR → Target) and Agentic Coordination Problem framing. Added LWW conflict resolution mention.
- Added "How XYPH Works (Part II)" sections: Digital Guild Model (Quests, Campaigns, Intents, Scrolls, Guild Seals, Genealogy of Intent), Planning Pipeline (Mermaid state diagram with fail-closed/ROLLED_BACK paths), and Policy Engine (MUST/SHOULD/COULD three-tier table).
- Constitution section expanded from 2 articles to all 4: Law of Determinism (Art. I), Law of DAG Integrity (Art. II), Law of Provenance (Art. III), Law of Human Sovereignty (Art. IV).
- Canonical Docs listing expanded from 5 to all 21 documents, organized into 6 categories (Vision & Governance, Architecture & Pipeline, Data & Schema, Security & Audit, Quality & Policy, RFCs).

**README rewritten with progressive-disclosure walkthrough**
- Replaced flat "Core Concepts / For Humans / For Agents" structure with a narrative walkthrough: Ada (human) and Hal (agent) build a feature together, introducing domain vocabulary (Intent, Quest, Campaign, Scroll, Guild Seal, OCP, Genealogy of Intent) inline on first use.
- Dashboard keybindings and CLI commands moved to compact reference tables after the walkthrough.
- Expanded Constitution section with links to all canonical specifications.
- `CLAUDE.md` updated: replaced stale "Current Status" with actuator-based planning workflow and full command reference.

**Added CONTRIBUTING.md**
- Development workflow, quality gates, Constitution summary, and full command reference table.

### Security

**minimatch ReDoS vulnerability (CVE: GHSA-3ppc-4f35-3m26)**
- Added npm `overrides` to force all transitive `minimatch` instances to `^10.2.1`, patching a Regular Expression Denial of Service (ReDoS) vulnerability where patterns with many consecutive `*` wildcards cause exponential backtracking (`O(4^N)`).
- All six affected instances (via eslint, eslint-plugin-import, @eslint/config-array, @eslint/eslintrc, @typescript-eslint/typescript-estree, glob) now resolve to `minimatch@10.2.2`.

**ajv ReDoS vulnerability (GHSA-2g4f-4pwh-qvx6)**
- Bumped transitive `ajv` (via `@eslint/eslintrc`, `eslint`) to patched versions via `npm audit fix`.

**Dependency upgrade**
- Upgraded `@git-stunts/git-warp` from `11.3.3` to `11.5.0`.

**Code Review — 68 issues resolved (CR-001)**
- *Critical*: `IngestService` rewritten — `task:` prefix guard, `new Quest()` in try/catch (skips invalid lines), clean formatting.
- *Critical*: `package-lock.json` synced to `alpha.4`.
- *High*: Eliminated actuator TOCTOU — `promote`/`reject`/`reopen` now call `WarpIntakeAdapter` directly instead of dual-graph validate-then-write.
- *High*: Added `reopen()` to `IntakePort` + `WarpIntakeAdapter`; all intake methods now return commit SHA.
- *High*: `syncCoverage() + materialize()` added at top of `WarpIntakeAdapter` and `WarpDashboardAdapter` operations.
- *High*: Cached `graphPromise` cleared on rejection in both WARP adapters.
- *High*: ESLint + lint script now covers `.tsx` files.
- *High*: `AllNodesView` quest detail modal now uses correct `flatQuests` array (was indexing into `snapshot.quests`).
- *High*: `Dashboard.tsx` `refresh` wrapped in `useCallback` — removed `eslint-disable` comment.
- *High*: `RoadmapView` `navigableIndices` moved into `useEffect` body with proper deps — removed `eslint-disable`.
- *High*: `xyph-dashboard.tsx` logo index fallback `?? 3`.
- *Medium*: `Quest.toProps()` method; `CoordinatorService` Phase 3 uses it instead of `...q` spread.
- *Medium*: `RebalanceService` is now a required constructor param (no hidden default).
- *Medium*: `WarpDashboardAdapter` skips scrolls with empty `questId`; caches `getNodeProps` across passes.
- *Medium*: `InboxView` — modal state captures `questId` at open time; `detailHeight` clamped; empty-inbox guard on `p`/`x`; arrow keys guarded in rationale modal; error state stored as parsed code+message.
- *Medium*: Shared `status-colors.ts` module — all views import from one source (includes INBOX).
- *Medium*: Typed `QuestNode.status` as `QuestStatus`, added `CampaignStatus` and `ApprovalGateStatus` types.
- *Medium*: `graveyard-ghosts.mts` skips `patch.commit()` when no mutations.
- *Low/Nit*: `??` instead of `||` for env reads; positive agentId regex; `asciiBar` fill clamped; `Scrollbar` thumbStart clamped; PageUp/PageDown in all scrollable views; trailing newlines on logo files; docs fixes (CHANGELOG formatting, README spacing, RFC milestone/author, model name).
- Tests: `getOutgoingEdges` added to mocks; service construction in `beforeEach`; test names corrected; mock extraction type-narrowed; ordering dependency documented.

**Wave 8 — Final review fixes (CR-005)**
- *Critical*: Dashboard graph cache invalidation — `WarpDashboardAdapter.invalidateCache()` clears cached graph via `WarpGraphHolder.reset()`, called on every refresh so intake mutations (promote/reject) are visible immediately. Added `invalidateCache?()` to `DashboardPort`.
- *Major*: `GuildSealService.generateKeypair()` now uses `loadKeyring()` for validation parity with `verify()`, eliminating divergent schema checks. Orphaned `.sk` file rollback on keyring write failure prevents permanently broken state. `verify()` now catches `loadKeyring()` errors gracefully (returns `false` instead of throwing).
- *Major*: `LandingView` progress bar now excludes GRAVEYARD quests (was only excluding INBOX), consistent with milestone detection logic.
- *Major*: ESLint test block now references `tsconfig.test.json` (was `tsconfig.json` which doesn't include `test/**`).
- *Minor*: `WarpIntakeAdapter` validates `task:` prefix on `questId` in all three methods (promote/reject/reopen). `WarpRoadmapAdapter.getOutgoingEdges()` now calls `syncCoverage()/materialize()` before reading edges. InboxView status bar clarifies only promote requires `human.*`. Static `randomBytes` import in `GuildSealService`.
- *Fix*: Restored `ajv`, `ajv-formats`, `ajv-errors` to `package.json` — incorrectly removed in CR-003 (L-03/L-04) but still required by `validatePatchOps.ts`. CI `verify-patch-ops` now passes.
- *Doc*: Updated `CLAUDE-XYPH-PAUSE.md` — DSH-004 marked resolved; DSH-001 remains sole pre-merge blocker. CHANGELOG version header updated to `1.0.0-alpha.5`.

**Wave 7 — Continued review fixes (CR-004)**
- *Medium*: Extracted shared `WarpGraphHolder` helper — eliminated triplicated `getGraph()`/`initGraph()` boilerplate across Dashboard, Intake, and Roadmap adapters (M-25).
- *Low*: Added runtime `isNeighborEntry` / `toNeighborEntries` type guard — replaced unsafe `as NeighborEntry[]` casts in all adapters with validated filtering (L-20). 10 new unit tests.
- *Nit*: `QuestDetailPanel` no longer receives full `GraphSnapshot` — callers pre-resolve campaign/intent titles (N-16).
- *Low*: Added 2-line scroll margin to `moveSelection` in all 4 scrollable views — selection no longer sits at the very edge of the visible area (L-30).
- *Documented design decisions*: campaign-aware rebalancing deferred to Milestone 6 (M-13); `isHumanPrincipal` convention-based, not security boundary (M-19); `isActive` input-focus architecture documented (M-26); view remount on tab switch acknowledged as Ink limitation (M-27); `campaign:TRIAGE` → graveyarded `roadmap:ROOT` edge documented (L-08); agent-only `requestedBy` per Constitution Art. IV.2 (L-14); instant resolution intentionally allowed (L-15); `trustDir` CWD dependency documented in JSDoc (L-18); private key memory handling is a JS limitation (L-19); `upsertQuest` can't unset properties, needs tombstone convention (L-24); hint text location clarified (N-21). N-02, N-03, N-04 were already addressed in CR-002.
- All 113 code review issues resolved; `CODE-REVIEW-ISSUES.md` tracking file removed. 186 tests passing.

**Wave 6 — 26 additional issues resolved (CR-003)**
- *High*: Documented order-independent integration test design (H-10); each test now uses dedicated seed nodes.
- *Medium*: Removed `chalk` from domain-layer `CoordinatorService` (M-12); validated `task:` prefix on `quest` CLI command (M-43); verified first quest upserted in partial-failure test (M-39); added modal staleness guard in `InboxView` (M-34); nearest-neighbor selection fallback in `LineageView` (M-36).
- *Low*: ESLint now covers root-level entry points (L-02); removed dead dependencies `ts-node`, `ajv`, `ajv-errors`, `ajv-formats` (L-03, L-04); explicit type narrowing in `graveyard-ghosts.mts` (L-06); documented asymmetric heartbeat behavior (L-11); graceful daemon shutdown with 500ms drain (L-12); `filterSnapshot` now removes scrolls referencing GRAVEYARD quests (L-17); documented zero-hour quests as intentional (L-16); negative hours clamped to 0 in `WarpRoadmapAdapter` (L-25); `promote()` verifies intentId/campaignId exist before creating edges (L-22); error state bypasses landing screen (L-27).
- *Nit*: Documented `--campaign "none"` escape hatch (N-24); clarified `noUncheckedIndexedAccess` guard comment (N-26).
- 176 tests passing (was 172 pre-review).

**NIT Remediation — 27 items resolved (CR-002)**
- *Config*: Removed redundant `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser` devDependencies (bundled by `typescript-eslint` v8+). Removed 8 redundant strict sub-options from `tsconfig.json` (implied by `"strict": true`).
- *Type safety*: `ApprovalNode.trigger` typed as `ApprovalGateTrigger` (was `string`); `STATUS_COLOR` typed as `Record<string, StatusColor>` — removed all `as StatusColor` casts. `WarpDashboardAdapter` now validates trigger values.
- *GuildSealService*: Renamed `canonicalPayload` → `serializePayload`; replaced `scroll as unknown as Json` double-cast with explicit field mapping.
- *render-status.ts*: Merged dual scroll maps into single iteration; fixed orphan tree connectors (`├─`/`└─`).
- *TUI views*: Spacer row keys use absolute index; removed redundant scroll-clamping `useEffect` in all 4 views; `LandingView` nextUp refactored to `.slice(1).map()`; fixed campaign selection removing empty-campaign false positive; `InboxView` agentId truncated in error; `onMutationEnd()` called before `setModal(null)`.
- *Entry points*: Removed dead truthiness check on required `--campaign`; renamed `__filename`/`__dirname` to `currentFilePath`/`currentDir`; added `noUncheckedIndexedAccess` comment on logo fallback.
- *Docs*: CHANGELOG comparison links; README Milestone 6 cross-reference and Omega footnote; RFC_001 `milestone:` → `campaign:` taxonomy fix and Section 8 clarification; removed model attribution from pause notes.
- *Tests*: Mock `addEdge` returns `Promise<string>`; `DashboardService` test uses direct snapshot access instead of mock internals; added ApprovalGate boundary tests (instantaneous resolution, negative createdAt); removed duplicate IntakeService test.

## [1.0.0-alpha.4] - 2026-02-17

### Added — POWERLEVEL™ Refactor: Genealogy of Intent Activation

**Full Orchestration Pipeline (PL-001)**
- Integrated `TriageService` and `RebalanceService` into the `CoordinatorService` heartbeat and orchestration flow.
- The `orchestrate` method now accepts an optional `contextHash` (BLAKE3) to link mutations back to their originating human intent.
- Every quest produced in a batch now passes through the `RebalanceService` for campaign-level resource constraint checking (160h limit).

**Structured Ingestion (PL-002)**
- Refactored `IngestService` to defer entity validation to the `NormalizeService` phase.
- Replaced "Silent Failure" (regex `continue` on invalid fields) with a permissive factory that allows the validation layer to provide structured error feedback.
- Bypassed `Quest` constructor validation during raw ingestion using `Object.create(Quest.prototype)` to allow the full pipeline to report all violations at once.

**Verification (PL-003)**
- Added `test/unit/CoordinatorService.POWERLEVEL.test.ts`: A high-fidelity test suite covering the Golden Path (Intent Linking), failure modes (Rebalance/Validation), and stress scenarios (Swarm orchestration).

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

[Unreleased]: https://github.com/flyingrobots/xyph/compare/v1.0.0-alpha.5...HEAD
[1.0.0-alpha.5]: https://github.com/flyingrobots/xyph/compare/v1.0.0-alpha.4...v1.0.0-alpha.5
[1.0.0-alpha.4]: https://github.com/flyingrobots/xyph/compare/v1.0.0-alpha.3...v1.0.0-alpha.4
[1.0.0-alpha.3]: https://github.com/flyingrobots/xyph/compare/v1.0.0-alpha.2...v1.0.0-alpha.3
[1.0.0-alpha.2]: https://github.com/flyingrobots/xyph/compare/v1.0.0-alpha.1...v1.0.0-alpha.2
[1.0.0-alpha.1]: https://github.com/flyingrobots/xyph/releases/tag/v1.0.0-alpha.1
