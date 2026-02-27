# CHANGELOG

All notable changes to XYPH will be documented in this file.

## [1.0.0-alpha.10] - 2026-02-26

### Changed — BJU-001: Bijou TUI Migration (Theme Bridge + TEA App Shell)

**Framework: Ink/React → bijou-tui TEA architecture**
- Replaced the Ink/React `Dashboard.tsx` component tree with a pure-function
  TEA (The Elm Architecture) app powered by `@flyingrobots/bijou-tui`'s `run()`.
- New `DashboardApp.ts`: `init()` / `update()` / `view()` with immutable
  `DashboardModel`, typed `DashboardMsg` union, and `Cmd<DashboardMsg>` effects.
- Keybindings via bijou-tui's `createKeyMap()` — `q`, `Tab`, `Shift+Tab`, `r`, `?`.
- Layout via `flex()` (column direction) with `tabs()` tab bar from `@flyingrobots/bijou`.

**Theme: local token system → bijou theme bridge**
- Replaced `tokens.ts`, `presets.ts`, `resolve.ts`, `chalk-adapter.ts`,
  `gradient.ts`, and `ink-adapter.tsx` with bijou's theme system.
- New `xyph-presets.ts`: extends bijou's `CYAN_MAGENTA` and `TEAL_ORANGE_PINK`
  with 15 XYPH status keys + `intentHeader` UI key via `extendTheme()`.
- New `bridge.ts`: lazy-init singleton that configures bijou's global context
  with XYPH presets, env-var theme selection (`XYPH_THEME`), and NO_COLOR support.
- `theme/index.ts` barrel: init-guarded `styled()` / `styledStatus()` wrappers
  that call `ensureXyphContext()` before delegating to bijou.

**Views: stub views for BJU-002 migration**
- Five new bijou view functions (`roadmap-view.ts`, `lineage-view.ts`,
  `all-view.ts`, `inbox-view.ts`, `landing-view.ts`) with summary stats
  and placeholder text for full rendering in BJU-002.

### Added
- `@flyingrobots/bijou` ^0.2.0, `@flyingrobots/bijou-node` ^0.1.0,
  `@flyingrobots/bijou-tui` ^0.1.0 as dependencies.
- git-warp API reference section in CLAUDE.md.

### Removed
- 17 old Ink/React files: `Dashboard.tsx`, `GraphProvider.tsx`, `HelpModal.tsx`,
  `QuestDetailPanel.tsx`, `Scrollbar.tsx`, `StatusLine.tsx`, and all 5 view
  components (`AllNodesView.tsx`, `InboxView.tsx`, `LandingView.tsx`,
  `LineageView.tsx`, `RoadmapView.tsx`), plus 6 local theme modules.
- `chalkFromToken()` — replaced by bijou's `styled()`.

### Fixed — Code Review (9 issues resolved: 3 high, 4 medium, 2 low)
- *High*: Ctrl+C was swallowed in landing (while loading) and help modes — hoisted
  Ctrl+C handler above mode-specific branches so it always quits.
- *High*: `q` did nothing in help mode despite help text listing it as quit —
  added `q` → quit handling in help mode to match displayed shortcuts.
- *High*: Lint violations (`explicit-function-return-type` on `makeApp()`,
  `no-non-null-assertion` on `resolver!`) — added return type annotation and
  replaced `!` with explicit guard + throw.
- *Medium*: `initialized` flag set before `createBijou()`/`createThemeResolver()`
  completed — moved flag after success to prevent permanently broken state on init
  failure.
- *Medium*: Refresh race condition — added monotonic `requestId` to model and
  snapshot messages; stale responses from superseded fetches are now discarded.
- *Medium*: `styled()`/`styledStatus()` re-exported without init safety — replaced
  raw re-exports with wrappers that call `ensureXyphContext()` before delegating.
- *Medium*: `_resetBridgeForTesting()` did not reset bijou's global default
  context — now calls `_resetDefaultContextForTesting()` for full test isolation.
- *Low*: Dead code removed — `dismiss-landing` message type/handler, unreachable
  `dismiss` action, unused `wordmarkText` field threaded through model and deps.
- *Low*: Landing "Press any key" prompt shown during loading (when keys are
  ignored) — prompt now only appears after data loads or on error.

## [1.0.0-alpha.9] - 2026-02-25

### Changed — Shared Graph Architecture & GraphContext Refactor

**Architecture: one WarpGraph instance per process**
- Introduced `GraphPort` (port) and `WarpGraphAdapter` (infrastructure) — a process-wide singleton for the shared `WarpGraph` instance. All adapters receive it via dependency injection instead of creating their own `WarpGraphHolder`.
- Rewired `WarpSubmissionAdapter`, `WarpIntakeAdapter`, `WarpRoadmapAdapter`, `coordinator-daemon`, `xyph-actuator`, and `xyph-dashboard` to use `GraphPort` DI.
- Eliminated WRITER_CAS_CONFLICT errors caused by multiple `WarpGraphHolder` instances sharing the same `writerId`.

**Architecture: kill the adapter-walks-every-node anti-pattern**
- Replaced monolithic `WarpDashboardAdapter` (542 LoC) + `DashboardService` (113 LoC) with `GraphContext` — a single shared gateway using `graph.query()` for typed node fetching and `graph.traverse` for graph algorithms.
- New `GraphProvider.tsx` (React context) delivers the `GraphContext` to TUI components.
- Extracted `DepAnalysis.ts` — pure domain functions for frontier detection and critical-path DP, replacing the algorithmic parts of `WeaverService`.

**Performance: atomic `graph.patch()` for all writes**
- Converted all adapters and `xyph-actuator.ts` from manual `syncCoverage() + materialize() + createPatchSession() + commit()` to `graph.patch(p => { ... })`.
- Eliminated redundant `materialize()` and `syncCoverage()` calls — `autoMaterialize: true` makes writes immediately visible to reads on the same instance.
- Submission lifecycle integration test: **15s timeout → default 5s**, actual runtime ~1.2s.

### Fixed
- `GraphContext` cache invalidation: replaced `hasFrontierChanged()` (only detects external patches) with frontier key comparison that catches both in-process `graph.patch()` writes and external mutations from `syncCoverage()`.

### Removed
- `WarpGraphHolder` — replaced by `WarpGraphAdapter`.
- `WarpDashboardAdapter`, `DashboardService`, `DashboardPort` — replaced by `GraphContext`.
- `WeaverService`, `WeaverPort`, `WarpWeaverAdapter` — replaced by `DepAnalysis` + direct `graph.traverse` calls.
- `WarpDashboardAdapter.test.ts`, `DashboardService.test.ts`, `WeaverService.test.ts`, `WarpWeaverAdapter.test.ts` — tests migrated to `DepAnalysis.test.ts` and existing integration suites.

**Code review — 7 issues resolved (1 critical, 2 high, 2 medium, 2 low)**
- *Critical*: `invalidateCache()` no longer calls `graphPort.reset()` — previous behavior orphaned the shared graph and violated the singleton invariant. Now only clears `GraphContext`'s own cached snapshot and frontier key.
- *High*: Removed inconsistent `syncCoverage()` call from the `depend` command — no other write command calls it post-refactor.
- *High*: Inlined dead `getGraph()` wrapper in `xyph-actuator.ts` — all ~7 call sites now use `graphPort.getGraph()` directly; removed unused `WarpGraph` type import.
- *Medium*: Reduced `getStateSnapshot()` calls in `fetchSnapshot()` from 3 to 2 — early call for cache check, post-materialize call for graphMeta and cached frontier key.
- *Medium*: `batchNeighbors()` now uses `Promise.all` instead of `Promise.allSettled` — neighbor resolution errors surface immediately instead of being silently swallowed.
- *Low*: Batched separate `graph.patch()` seed calls into single patches in `WarpIntakeAdapter.test.ts` and `WarpSubmissionAdapter.test.ts`.
- *Low*: Fixed JSDoc in `GraphPort.ts` — replaced reference to private `_onPatchCommitted` with public description.

## [1.0.0-alpha.8] - 2026-02-25

**Milestone 7: Weaver — Task Dependency Graph**

### Added
- `depend <from> <to>` CLI command: declares `depends-on` edges between `task:` nodes with cycle detection, self-dependency prevention, and existence validation.
- `status --view deps`: new dashboard view showing frontier (ready tasks), blocked tasks, topological execution order, and critical path with total hours.
- `WeaverService` (domain): pure validation and computation — frontier detection, topological ordering (via git-warp v12 `LogicalTraversal`), critical path DP over dependency DAG.
- `WeaverPort` (port): write interface for dependency edge persistence.
- `WarpWeaverAdapter` (infrastructure): implements both `WeaverPort` and `WeaverReadModel` using git-warp v12's `graph.traverse.isReachable()`, `graph.traverse.topologicalSort()`, and `graph.getEdges()`.
- `QuestNode.dependsOn` field in dashboard model; `WarpDashboardAdapter` reads `depends-on` edges during snapshot construction.
- `renderDeps()` renderer: frontier table, blocked-tasks table, numbered execution order, and critical path chain display.
- CI workflow (`.github/workflows/ci.yml`): enforces build, lint, and test gates on every PR and push to main as three parallel jobs.
- CI `audit` job: runs `npm audit --omit=dev` to catch known vulnerabilities in production dependencies.
- 31 new tests (23 unit + 8 integration), 369 total.

### Fixed
- `inspect-graph.ts`: replaced unsafe inline type cast with `toNeighborEntries()` runtime guard.

## [1.0.0-alpha.7] - 2026-02-24

**TUI Overhaul: Fullscreen, Flicker-Free Rendering & Responsive Layout**

### Added

**Alternate screen + flicker-free rendering shim**
- `xyph-dashboard.tsx`: enters alternate screen buffer (`\x1b[?1049h`) on launch, restores on exit.
- Patches `stdout.write` to replace Ink's `clearTerminal` (erase + rewrite) with cursor-home + erase-to-EOL, eliminating full-screen flash on every render.
- Proper cleanup on SIGINT/SIGTERM — always restores the original terminal.

**git-warp verbose logging in the gutter**
- `TuiLogger` (`src/tui/TuiLogger.ts`): new `LoggerPort` implementation that captures git-warp internal logs via a callback for display in the TUI.
- `WarpGraphHolder` and `WarpDashboardAdapter` accept optional `LoggerPort`, passed to `WarpGraph.open()`.
- Dashboard subscribes to logger with 150ms throttle to prevent rapid re-renders.

**Persistent gutter on all screens**
- `StatusLine` now renders on every screen (landing, loading, error, main views) — no more early returns that skip it.
- Dashboard restructured: root `<Box height={rows}>` wrapper with `flexGrow={1}` content area and pinned gutter.
- `LandingView` uses `flexGrow={1}` + `justifyContent="center"` for vertical centering within the flex container.

### Changed

**Status line simplified**
- Replaced `tick: 142 (8a062e1) | me: 122 | writers: 5` with `t=142` — one number, the global frontier tick.
- Dropped per-writer tick and writer count (implementation details, not user-facing).
- Gutter log line prefixed with `[warp(t=N)]` showing the current graph tick when available.

**Cold start performance**
- Removed `syncCoverage()` from first-load path — `WarpGraph.open()` discovers refs automatically.
- Restored `syncCoverage()` on refresh path — discovers external mutations committed since last materialize.
- Added `createCheckpoint()` after `materialize()` — persists materialized state so subsequent launches load from checkpoint instead of replaying all patches.
- `tipSha` now derived from `createCheckpoint()` return value (content hash of materialized state) instead of writer tip commit.

**Responsive full-width table layout**
- All four views (`RoadmapView`, `LineageView`, `AllNodesView`, `InboxView`) now calculate column widths dynamically from terminal width.
- Title columns absorb remaining width instead of using hardcoded `.padEnd()` values.
- Tables fill edge-to-edge on any terminal size (min 12 chars for title).

### Fixed

- Ghost content on title screen: erase-to-end-of-line (`\x1b[K`) injected after each line during cursor-home redraws, preventing remnants from longer previous renders.
- Full terminal height: root Box in Dashboard and LandingView now properly fills terminal via `height={rows}` / `flexGrow={1}`.

**Code review — 15 issues resolved (4 HIGH, 6 MEDIUM, 5 LOW)**
- *High*: `TuiLogger.child()` now delegates `onEntry` through parent chain — children created before `onEntry` is set no longer get a permanent `null` callback.
- *High*: `HelpModal` renders as the content area (replacing views) instead of appended below `StatusLine` — no longer overflows `height={rows}`.
- *High*: `WarpDashboardAdapter` calls `syncCoverage()` on refresh path (when `cachedSnapshot !== null`) to discover external mutations; skipped on first load where `WarpGraph.open()` handles discovery.
- *High*: `xyph-dashboard.tsx` cleanup guard prevents double terminal-restore on SIGINT → exit handler chain.
- *Medium*: `StatusLine` always renders 2 lines (empty second line when no logLine) — stabilizes `gutterLines` constant.
- *Medium*: Log prefix changed from unstable `[warp(SHA)]` to `[warp(t=N)]` using graph tick.
- *Medium*: `LineageView` trailing spaces (+4) added to `lineageFixedW`; status text padded to fixed 14 chars.
- *Medium*: `AllNodesView` magic `10` extracted to `scrollSealW` constant with comment.
- *Medium*: `package.json` version bumped to `1.0.0-alpha.7`.
- *Low*: `TuiLogger.emit()` nested ternary refactored to explicit if/else.
- *Low*: `InboxView` `suggestedBy` uses `suggestedByW - 2` instead of hardcoded `14`.
- *Low*: `AllNodesView` `questSuffixW` components documented with inline comments.
- *Low*: `LineageView` `intentIdW` reverted from 32 to 30 (matches original behavior).
- *Low*: `Dashboard.tsx` `cols` moved inside else branch where it's actually used.

**Codex review — 2 issues resolved (1 P1, 1 P2)**
- *P1*: `WarpDashboardAdapter` `syncCoverage()` on refresh path — already addressed in H-3 above.
- *P2*: `xyph-dashboard.tsx` SIGINT/SIGTERM handlers now use conventional signal exit codes (130/143) instead of `exit(0)`, so shell wrappers and supervisors can distinguish cancel/kill from success.

**CodeRabbit review — 6 issues resolved (1 major, 3 minor, 2 nit)**
- *Major*: `WarpDashboardAdapter.createCheckpoint()` wrapped in try/catch — checkpoint failures no longer block snapshot rendering; falls back to `tipSha='unknown'`.
- *Minor*: `CHANGELOG.md` unused `[Unreleased]` link reference resolved by adding `## [Unreleased]` section header (MD053).
- *Minor*: `AllNodesView` `sealedBy` column now truncated before padding to prevent line wraps on long values.
- *Minor*: `LandingView` layout — full test suite (`npm run build` + `npm run test:local`) verified: 338/338 pass, lint clean.
- *Nit*: `StatusLine` exports `STATUS_LINE_HEIGHT` constant; `Dashboard.tsx` imports it instead of hardcoding `gutterLines = 2`.
- *Nit*: `TuiLogger.onEntry` setter throws on child loggers — prevents silent misconfiguration since `resolveOnEntry()` always defers to root.

---

## [1.0.0-alpha.6] - 2026-02-22

**Dashboard Performance & UX Improvements**

### Changed

**Performance — parallel graph snapshot loading**
- `WarpDashboardAdapter.fetchSnapshot()`: batch-fetch all node props via `Promise.all` instead of sequential awaits (142 nodes).
- Pre-fetch all outgoing `neighbors()` calls in a single parallel batch, eliminating sequential I/O across 4 passes.
- `buildSubmissionData()` converted from async to synchronous — uses pre-fetched neighbors cache instead of live graph queries.

**Loading UI — activity log on landing screen**
- `DashboardPort.fetchSnapshot()` now accepts optional `onProgress` callback for phase-level progress reporting.
- `LandingView` displays a live activity log (last 10 lines) during graph loading, replacing the static "Loading…" message.

**Copywriting — brand consistency**
- "WARP GRAPH STATUS" → "XYPH GRAPH STATUS" on the landing screen.
- "Loading WARP graph snapshot…" → "Loading project graph snapshot…".

### Fixed

**Tab cycling — defensive key guards**
- Added explicit `return` after `key.tab` handler in `Dashboard.tsx` to prevent fall-through.
- All 4 view components (`RoadmapView`, `LineageView`, `AllNodesView`, `InboxView`) now explicitly ignore `key.tab` at the top of their `useInput` handlers, ensuring Tab keypresses are cleanly handled only by Dashboard's view-switching logic.

**Code review — 31 issues resolved across 3 rounds**
- *High*: Removed `getTheme`/`styled` TUI imports from domain-layer `TriageService` and `SovereigntyService` — domain services now use plain `console.log`/`console.warn` (hexagonal architecture fix).
- *High*: Changed `'Opening WARP graph…'` → `'Opening project graph…'` in `WarpDashboardAdapter` progress log (brand consistency).
- *High*: `WarpDashboardAdapter` batch prop fetch changed from `Promise.all` → `Promise.allSettled` for partial-failure resilience.
- *High*: `WarpDashboardAdapter` batch neighbor fetch changed from `Promise.all` → `Promise.allSettled` (mirrors props pattern).
- *Medium*: Added missing space after comma in 91 `styled()` calls in `xyph-actuator.ts`.
- *Medium*: Removed redundant `syncCoverage()` + `materialize()` from `WarpGraphHolder.initGraph()`.
- *Medium*: `TriageService.linkIntent()` log moved after null guard to avoid misleading entries.
- *Medium*: StatusLine prefix `/// WARP` → `/// XYPH`; remaining WARP branding in STYLE_GUIDE updated.
- *Low*: `ThemeProvider` now uses `useMemo` for stable context value (prevents unnecessary re-renders).
- *Low*: Exhaustive `never` check added to `chalkFromToken` `TextModifier` switch.
- *Low*: NaN guard added to `gradient.ts` for duplicate stop positions.
- *Low*: `WarpDashboardAdapter` uses `NeighborEntry` type instead of inline shape.
- *Low*: `result.reason` safely stringified in batch warning logs.
- *Low*: Test hygiene — `warnSpy` wrapped in `try/finally`, hardcoded hex replaced with token lookup, `vi.unstubAllEnvs()` for env restoration, `satisfies` assertion on status keys, status keys derived from theme.
- *Low*: `Dashboard.tsx` now clears `loadLog` state when snapshot loads.
- *Low*: Replaced inline token construction in `coordinator-daemon.ts`.
- *Low*: Re-indented `scripts/bar-demo.ts` (project convention).
- *Low*: CHANGELOG structure — merged `[Unreleased]` into `[1.0.0-alpha.6]`, added comparison link.

---

**Theme Token System — Full Visual Layer Migration**

### Added

**Theme module (`src/tui/theme/`)**
- New `tokens.ts`: `RGB`, `GradientStop`, `TextModifier`, `TokenValue`, `InkColor`, `StatusKey`, `Theme` type definitions. All colors stored as `#RRGGBB` hex strings for deterministic cross-terminal rendering.
- New `presets.ts`: `CYAN_MAGENTA` theme (matches all prior hardcoded values exactly) and `TEAL_ORANGE_PINK` theme (new candidate palette from gradient experiment). Helper `tv()` for concise token definition.
- New `gradient.ts`: `lerp3()` N-stop linear interpolation extracted from `scripts/bar-demo.ts`.
- New `resolve.ts`: `isNoColor()` (per no-color.org spec), `getTheme()` singleton with `XYPH_THEME` env var selection, `resolveTheme()` for React context, `_resetThemeForTesting()`.
- New `chalk-adapter.ts`: `chalkFromToken()`, `styled()`, `styledStatus()` — chalk from theme tokens with NO_COLOR support (hex skipped, modifiers preserved).
- New `ink-adapter.tsx`: `ThemeProvider` React context component, `useTheme()` hook with singleton fallback for incremental migration.
- New `index.ts`: barrel re-exports.
- Theme selection via `XYPH_THEME` env var (e.g., `XYPH_THEME=teal-orange-pink`).
- NO_COLOR respected: `ink()` returns `undefined` → Ink renders default terminal color; `chalkFromToken()` skips `.hex()` → only modifiers apply.

**Tests — 44 new tests (338 total, up from 249)**
- `gradient.test.ts` — 9 tests: boundary values, mid-stop interpolation, single-stop and empty-stop edge cases.
- `presets.test.ts` — 13 tests: all status keys defined in both presets, hex format validation, gradient stop ordering.
- `resolve.test.ts` — 11 tests: theme selection, NO_COLOR detection, singleton caching, unknown theme fallback with warning.
- `chalk-adapter.test.ts` — 11 tests: styled output, status rendering, modifier application, NO_COLOR mode.

### Changed

**TUI components — color literals → theme tokens (10 files)**
- `Scrollbar.tsx`: `cyan/gray` → `ui.scrollThumb/scrollTrack`.
- `HelpModal.tsx`: `cyan` border → `border.primary`, `yellow` headings → `semantic.warning`.
- `QuestDetailPanel.tsx`: dropped `STATUS_COLOR` import, uses `inkStatus()` and semantic tokens.
- `Dashboard.tsx`: `cyan/gray` tabs → `ui.cursor/semantic.muted`, `yellow/red` states → semantic tokens.
- `LandingView.tsx`: `green` progress → `semantic.success`, `cyan` logo → `ui.logo`, `yellow` milestone → `semantic.warning`.
- `RoadmapView.tsx`: `cyan` cursor → `ui.cursor`, `blue` campaign headers → `ui.sectionHeader`, status lookups via `inkStatus()`.
- `LineageView.tsx`: `magenta` intent headers → `ui.intentHeader`, `cyan` cursor → `ui.cursor`.
- `AllNodesView.tsx`: `green` section headers → `semantic.success`, `cyan` cursor → `ui.cursor`.
- `InboxView.tsx`: `magenta` headers → `ui.intentHeader`, `cyan/yellow/red` modal borders → `border.*`.
- `xyph-dashboard.tsx`: wraps `<Dashboard>` in `<ThemeProvider>`.

**CLI consumers — chalk → theme tokens (6 files)**
- `xyph-actuator.ts`: all 91 `chalk.*` calls replaced with `styled(getTheme().theme.semantic.*, ...)`.
- `render-status.ts`: eliminated both local `STATUS_COLOR` maps; all `chalk.*` calls → `styled()`/`styledStatus()`.
- `coordinator-daemon.ts`: 10 `chalk.*` calls → `styled()`.
- `inspect-graph.ts`: 7 `chalk.*` calls → `styled()`.
- `TriageService.ts`: `chalk.cyan` → `styled(semantic.info, ...)` — also fixes hexagonal architecture violation (domain layer no longer imports chalk directly).
- `SovereigntyService.ts`: `chalk.yellow` → `styled(semantic.warning, ...)` — same hexagonal fix.

**Gradient integration**
- `scripts/bar-demo.ts`: imports `lerp3` from `src/tui/theme/gradient.js` and gradient presets from `src/tui/theme/presets.js`; removed local duplicate definitions.

### Removed
- `src/tui/status-colors.ts` — replaced by `theme.status.*` tokens. Both the TUI `StatusColor` map and the CLI `STATUS_COLOR` function map are now unified in the theme presets.

---

**Backlog Reconciliation & Roadmap Triage**

### Added
- New `intent:CLI-FOUNDATION` — sovereign intent for CLI tooling (identity, packaging, time-travel, ergonomics).
- New `campaign:CLITOOL` (Milestone 10: CLI Tooling) — 20 quests promoted from inbox.

### Changed
- VISION_NORTH_STAR.md upgraded from v1.1.0 to v1.2.0: added history-first computing, stigmergic workflows, Git-as-settlement layering, expanded planning compiler and end state sections.
- Deleted `VISION_NORTH_STAR_v1.2_draft.md` (promoted to authoritative).
- README milestones table: Milestone 6 (SUBMISSION) marked DONE, Milestone 10 (CLI TOOLING) added.
- Full inbox triage: 31 items processed — 1 rejected (SUB-ENTITY-001, fixed in PR #10), 20 promoted to `campaign:CLITOOL`, 10 promoted to `campaign:DASHBOARD`.

---

**Milestone 6: Native WARP Graph Submission & Review Workflow**

### Added

**Submission lifecycle (SUB-001)**
- New graph node types: `submission:`, `patchset:`, `review:` prefixes added to schema.
- New edge types: `submits`, `has-patchset`, `supersedes`, `reviews`, `decides`.
- `Submission` and `Patchset` domain entities with constructor validation (`src/domain/entities/Submission.ts`).
- Three pure computed functions: `computeTipPatchset()` (head selection from supersedes chain, fork detection), `computeEffectiveVerdicts()` (latest-per-reviewer, comment exclusion), `computeStatus()` (5-state derivation: OPEN → CHANGES_REQUESTED → APPROVED → MERGED | CLOSED).
- `SubmissionService` domain validation service with `validateSubmit`, `validateRevise`, `validateReview`, `validateMerge`, `validateClose`. Error codes: `[FORBIDDEN]`, `[INVALID_FROM]`, `[NOT_FOUND]`, `[MISSING_ARG]`, `[CONFLICT]`, `[AMBIGUOUS_TIP]`.

**Ports & adapters (SUB-002)**
- `SubmissionPort` interface: `submit()`, `revise()`, `review()`, `decide()` — graph-only persistence, caller-generated IDs.
- `WorkspacePort` interface: `getWorkspaceRef()`, `getCommitsSince()`, `getHeadCommit()`, `isMerged()`, `merge()` — VCS abstraction (Git today, JIT tomorrow).
- `WarpSubmissionAdapter`: implements both `SubmissionPort` (write) and `SubmissionReadModel` (read) against the WARP graph.
- `GitWorkspaceAdapter`: implements `WorkspacePort` using local git plumbing.

**CLI commands (SUB-003)**
- `xyph submit <quest-id> --description "..."` — creates submission + first patchset, auto-fills workspace/head/commits from git.
- `xyph revise <submission-id> --description "..."` — adds new patchset superseding current tip.
- `xyph review <patchset-id> --verdict approve|request-changes|comment --comment "..."` — posts a review.
- `xyph merge <submission-id> --rationale "..."` — validates APPROVED status, performs git settlement, creates merge decision, auto-seals quest (scroll + GuildSeal + DONE).
- `xyph close <submission-id> --rationale "..."` — creates close decision without merging.

**Dashboard (SUB-004)**
- `SubmissionNode`, `ReviewNode`, `DecisionNode` view models added to `dashboard.ts`.
- `QuestNode` gains optional `submissionId` field.
- `WarpDashboardAdapter` classifies submission/patchset/review/decision nodes and computes status using domain functions.
- New `renderSubmissions()` renderer; wired as `--view submissions`.
- Submission status colors: OPEN (cyan), CHANGES_REQUESTED (yellow), APPROVED (green), MERGED (green), CLOSED (dim).

**Integration safeguards (SUB-005)**
- `seal` command now warns if a non-terminal submission exists for the quest, suggesting `merge` instead.
- `seal` and `merge` are independent paths to quest DONE — both remain valid.

### Changed

**Submission workflow jank fixes (6 items)**
- `WarpSubmissionAdapter`: replaced O(n) full-graph scans with `graph.neighbors(nodeId, 'incoming', edgeLabel)` edge traversal in `getOpenSubmissionsForQuest`, `getPatchsetRefs`, `getReviewsForPatchset`, `getDecisionsForSubmission`.
- `WarpDashboardAdapter`: extracted 170-line fourth pass (submission/review/decision assembly) into private `buildSubmissionData()` helper, reducing `fetchSnapshot()` from ~390 to ~240 lines.
- `GitWorkspaceAdapter.merge()`: saves current branch before checkout, restores in `finally` block to avoid silently switching the user's working branch.
- `generateId()`: zero-padded base36 timestamp to 9 chars (17-char fixed-length IDs), now lexicographically sortable by creation time.
- `PatchsetRef.supersedes` renamed to `supersedesId` across all files for clarity.
- Added comments documenting the `decision:` prefix collision guard (shared between old concept/decision nodes and new submission decisions; `type === 'decision'` discriminator already handles it).

**Tests — 63 new tests (249 total)**
- `test/unit/Submission.test.ts` — 29 tests: entity constructors, `computeTipPatchset` (linear chain, forked heads, tie-breaking), `computeEffectiveVerdicts` (latest-per-reviewer, comment exclusion), `computeStatus` (all 5 rules, custom thresholds).
- `test/unit/SubmissionService.test.ts` — 24 tests: all validate* methods with error code coverage.
- `test/integration/WarpSubmissionAdapter.test.ts` — 6 tests: submit, revise, review, decide(close), full lifecycle (submit → request-changes → revise → approve → merge), getOpenSubmissionsForQuest terminal exclusion.

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

[Unreleased]: https://github.com/flyingrobots/xyph/compare/v1.0.0-alpha.10...HEAD
[1.0.0-alpha.10]: https://github.com/flyingrobots/xyph/compare/v1.0.0-alpha.9...v1.0.0-alpha.10
[1.0.0-alpha.9]: https://github.com/flyingrobots/xyph/compare/v1.0.0-alpha.8...v1.0.0-alpha.9
[1.0.0-alpha.8]: https://github.com/flyingrobots/xyph/compare/v1.0.0-alpha.7...v1.0.0-alpha.8
[1.0.0-alpha.7]: https://github.com/flyingrobots/xyph/compare/v1.0.0-alpha.6...v1.0.0-alpha.7
[1.0.0-alpha.6]: https://github.com/flyingrobots/xyph/compare/v1.0.0-alpha.5...v1.0.0-alpha.6
[1.0.0-alpha.5]: https://github.com/flyingrobots/xyph/compare/v1.0.0-alpha.4...v1.0.0-alpha.5
[1.0.0-alpha.4]: https://github.com/flyingrobots/xyph/compare/v1.0.0-alpha.3...v1.0.0-alpha.4
[1.0.0-alpha.3]: https://github.com/flyingrobots/xyph/compare/v1.0.0-alpha.2...v1.0.0-alpha.3
[1.0.0-alpha.2]: https://github.com/flyingrobots/xyph/compare/v1.0.0-alpha.1...v1.0.0-alpha.2
[1.0.0-alpha.1]: https://github.com/flyingrobots/xyph/releases/tag/v1.0.0-alpha.1
