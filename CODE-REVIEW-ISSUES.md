# Code Review Issues — `feat/milestone-4-sovereignty`

**Reviewed:** 2026-02-19
**Branch:** `feat/milestone-4-sovereignty` → `origin/main`
**Scope:** 14 commits, 58 files, +5,220 / −15,968 lines

| Severity | Count |
|----------|------:|
| HIGH     |    12 |
| MEDIUM   |    45 |
| LOW      |    30 |
| NIT      |    26 |
| **Total**| **113** |

---

## HIGH (12)

### `package.json`

- [x] **H-01** — `"main": "index.js"` entry point does not exist — no `index.js` in root or `dist/`; programmatic imports fail with `MODULE_NOT_FOUND`
- [x] **H-02** — Version still `1.0.0-alpha.4` — should be bumped to `1.0.0-alpha.5` for completed Milestone 5 work; CHANGELOG `[Unreleased]` header needs a dated version tag

### `scripts/backlog-update.mts`

- [x] **H-03** — `weaverQuests` array includes `'task:WVR-006'` which was never created in `setup-milestones-4-7.ts` (only WVR-001–005 exist) — creates a dangling `authorized-by` edge to a nonexistent node

### `src/coordinator-daemon.ts`

- [x] **H-04** — `setInterval` fires overlapping `heartbeat()` calls if a heartbeat takes longer than `INTERVAL_MS` — concurrent `roadmap.sync()` and graph reads race; failure counters interleave unpredictably

### `src/domain/services/GuildSealService.ts`

- [x] **H-05** — `generateKeypair` does `JSON.parse(fs.readFileSync(...)) as { version, keys }` on `keyring.json` with no structural validation; also no `ENOENT` guard if the file doesn't exist (unlike `loadKeyring()` which handles both)

### `src/infrastructure/adapters/WarpRoadmapAdapter.ts`

- [x] **H-06** — `getGraph()` caches a rejected promise permanently — unlike Dashboard and Intake adapters which have `.catch((err) => { this.graphPromise = null; throw err; })`, this adapter has no error recovery; a single init failure makes it permanently broken

### `src/tui/Dashboard.tsx`

- [x] **H-07** — `refresh()` not debounced or guarded against concurrent invocations — rapid `r` presses fire concurrent `getSnapshot()` calls; a slow first response resolving after a fast second one overwrites fresh data with stale data; `.finally(() => setLoading(false))` from the stale promise incorrectly clears loading state

### `src/tui/views/RoadmapView.tsx`

- [x] **H-08** — `useEffect` dependency array includes `vrows` which is a new array reference on every render (not memoized) — effect fires every render, calling `setSelectedVIdx` each time and triggering cascading re-renders

### `src/tui/views/AllNodesView.tsx`, `InboxView.tsx`, `LineageView.tsx`, `RoadmapView.tsx` (H-09: stale closures)

- [x] **H-09** — `useInput` handlers capture stale closures of `clampedOffset` / `clampedVIdx` / `questCount` — rapid key presses within the same tick can operate on outdated state values

### `test/integration/WarpIntakeAdapter.test.ts`

- [x] **H-10** — Tests are explicitly order-dependent ("Tests share a mutable git repo and MUST run in declaration order") — the promote test mutates `task:INTAKE-001` from INBOX to BACKLOG, and later tests depend on that side-effect; `--shuffle` or parallel runs will break

### `test/unit/CoordinatorService.test.ts`

- [x] **H-11** — `CoordinatorService` constructed once at module scope (line 18) and shared across all tests — breaks isolation if injected services gain state; the POWERLEVEL variant correctly recreates in `beforeEach`

### Cross-cutting (~15 call sites)

- [x] **H-12** — `(await graph.createPatch()) as PatchSession` — unsafe cast on `Promise<unknown>` return type with zero runtime validation; affects `xyph-actuator.ts`, `WarpIntakeAdapter.ts`, `WarpRoadmapAdapter.ts`, `WarpDashboardAdapter.ts`, `backlog-update.mts`, `graveyard-ghosts.mts`

---

## MEDIUM (45)

### `CHANGELOG.md`

- [x] **M-01** — Alpha.3 entry says "101 passing" tests — current suite has 172; Unreleased section does not state the updated total
- [x] **M-02** — Alpha.1 entry references `xyph-actuator.mjs` which no longer exists (migrated to `.ts`) — no supersession note

### `CLAUDE-XYPH-PAUSE.md`

- [x] **M-03** — States DSH-004 IngestService test is failing — already fixed in commit `b82841a`; PR #7 status also potentially stale

### `README.md`

- [x] **M-04** — Milestone 5 status shown as "IN PROGRESS" but work is feature-complete per CHANGELOG and session notes

### `eslint.config.js`

- [x] **M-05** — `test/**` in ignores array — all test files completely excluded from ESLint; contradicts project policy of "never circumvent quality checks"

### `scripts/backlog-update.mts`

- [x] **M-06** — Not idempotent — no `hasNode()` guard before `addNode()`; the script's own comment warns re-running "may fail or create duplicates" but no defensive code exists (unlike `graveyard-ghosts.mts` which checks first)

### `scripts/graveyard-ghosts.mts`

- [x] **M-07** — `PatchSession` created eagerly (line 33) before the mutation loop — if `mutated` stays `false`, the patch is never committed but the Lamport clock was already incremented; should create patch only when mutations are collected

### `src/domain/entities/Quest.ts`

- [x] **M-08** — `QuestType` includes `'scroll' | 'milestone' | 'campaign' | 'roadmap'` but the constructor enforces `id.startsWith('task:')` — only `'task'` is ever constructable; dead type variants
- [x] **M-09** — No runtime `status` validation against valid `QuestStatus` values — data from the untyped WARP graph can inject arbitrary strings; `ApprovalGate` has defense-in-depth validation but `Quest` does not

### `src/domain/models/dashboard.ts`

- [x] **M-10** — `ApprovalGateStatus` defined identically in both `dashboard.ts` (line 9) and `ApprovalGate.ts` (line 13) — two independent type aliases that can silently diverge if one is updated
- [x] **M-11** — `CampaignStatus` has both `ACTIVE` and `IN_PROGRESS` as separate values — semantically ambiguous; `backlog-update.mts` uses `IN_PROGRESS` while the type also allows `ACTIVE`; `UNKNOWN` may mask data quality issues

### `src/domain/services/CoordinatorService.ts`

- [ ] **M-12** — `chalk` imported directly in domain service — violates hexagonal architecture; domain layer should not know about terminal color formatting; should inject a `LoggerPort`
- [ ] **M-13** — All quests validated against hardcoded `'campaign:default'` for rebalancing — ignores actual campaign grouping; mixed-campaign input gets incorrect aggregate hour limit

### `src/domain/services/DashboardService.ts`

- [x] **M-14** — `scrollByQuestId` in `getLineage()` silently overwrites when multiple scrolls fulfill the same quest — last one wins with no warning; `LineageTree` type only allows single optional scroll per quest

### `src/domain/services/GuildSealService.ts`

- [ ] **M-15** — Duplicate `sha512` polyfill `(ed as any).hashes.sha512 = sha512` — same assignment in `crypto.ts` line 11; maintenance hazard if polyfill logic changes

### `src/domain/services/IngestService.ts`

- [x] **M-16** — `as [string, string, string, string, string?, string?]` unsafe tuple cast on regex match result — bypasses TypeScript's null safety on captured groups
- [x] **M-17** — `@campaign` capture group (`match[5]`) is parsed by the regex `(?:\s+@([a-z]+:[A-Z0-9-]+))?` but silently discarded — users can write `@campaign:FOO` syntax that is accepted and ignored
- [x] **M-18** — `idPrefix as QuestType` cast is misleading — the guard on line 25 already restricts to `'task'` only; the `as QuestType` suggests other prefixes could flow through

### `src/domain/services/IntakeService.ts`

- [ ] **M-19** — `isHumanPrincipal` determines authorization solely via `actorId.startsWith('human.')` — trivially spoofable; any caller providing `'human.malicious-bot'` bypasses the guard with no cryptographic verification

### `src/infrastructure/adapters/WarpDashboardAdapter.ts`

- [x] **M-20** — `CampaignStatus` cast from arbitrary graph string after only `typeof === 'string'` check — no membership validation; a value like `'BANANA'` passes through as a valid `CampaignStatus`
- [x] **M-21** — `ApprovalGateStatus` cast from arbitrary graph string — same issue; no validation against `'PENDING' | 'APPROVED' | 'REJECTED'`
- [x] **M-22** — `QuestStatus` cast from arbitrary graph string — inconsistent with `WarpRoadmapAdapter` which validates against a `VALID_STATUSES` set
- [x] **M-23** — `scrollByQuestId` silently overwrites on duplicate scrolls per quest — no conflict warning logged; if a quest has multiple seals, only the last encountered wins

### `src/infrastructure/adapters/WarpRoadmapAdapter.ts`

- [x] **M-24** — `getQuests()` / `getQuest()` don't call `syncCoverage()` / `materialize()` before reading — returns stale data; both Dashboard and Intake adapters sync before every read

### `src/infrastructure/adapters/` (all three adapters)

- [ ] **M-25** — Near-identical `getGraph()` / `initGraph()` boilerplate duplicated across Dashboard, Intake, and Roadmap adapters — any bug fix (like the missing `.catch` in H-06) must be applied three times independently

### `src/tui/Dashboard.tsx`

- [ ] **M-26** — `useInput` input-focus architecture is fragile — relies on each child view individually checking `isActive` to avoid stealing keypresses from the help modal; any view that forgets to gate on `isActive` will capture input incorrectly
- [ ] **M-27** — View switching via `&&` conditional rendering unmounts/remounts components — all internal state (scroll position, selected item, fold state) is destroyed on tab switch

### `src/tui/render-status.ts` + `src/tui/status-colors.ts`

- [x] **M-28** — Two independent `STATUS_COLOR` maps with divergent entries — `render-status.ts` includes `GRAVEYARD` (with strikethrough) while `status-colors.ts` does not; any new status must be added to both

### `src/tui/status-colors.ts`

- [x] **M-29** — Missing `GRAVEYARD` entry — quests with this status fall through to `?? 'white'` silently with no visual distinction from normal text
- [x] **M-30** — Typed as `Record<string, string>` — completely open-ended; defeats `noUncheckedIndexedAccess`; should use `Partial<Record<QuestStatus | CampaignStatus, string>>` for key safety

### `src/tui/views/AllNodesView.tsx`, `InboxView.tsx`, `LineageView.tsx`, `RoadmapView.tsx` (M-31–M-35: memoization & input)

- [x] **M-31** — `buildRows()` recomputed on every render without `useMemo` — iterates all campaigns, intents, quests, scrolls, approvals each render cycle
- [x] **M-32** — `useEffect` scroll-clamping depends on `[vrows.length, listHeight]` but `vrows` is rebuilt every render — the effect duplicates work already done synchronously by `clampedOffset` and causes an extra render cycle

### `src/tui/views/InboxView.tsx`

- [x] **M-33** — Select-intent modal: down-arrow computes `Math.min(intents.length - 1, ...)` which yields `-1` when `intents.length === 0` (reachable if snapshot changes while modal is open)
- [ ] **M-34** — Snapshot can change while modal is open — `modal.questId` may no longer exist in the inbox and `modal.intentIdx` may be out of bounds against the new intents array

### `src/tui/views/LineageView.tsx`

- [x] **M-35** — `useInput` handlers lack `return` after each `moveSelection` call — unlike AllNodesView and RoadmapView which early-return; multiple handlers can fire for a single key event
- [ ] **M-36** — Selection fallback always snaps to `questIndices[0] ?? 0` when current selection is invalidated — should find nearest navigable index like RoadmapView does

### `test/integration/WarpIntakeAdapter.test.ts`

- [x] **M-37** — `[FORBIDDEN]` test operates on `task:INTAKE-001` which is already promoted to BACKLOG by a prior test — passes only because the authority check runs before the graph read; if implementation order ever changes, would throw `[INVALID_FROM]` instead

### `test/unit/CoordinatorService.POWERLEVEL.test.ts`

- [x] **M-38** — No test for exact rebalance boundary (161h) — only 200h and 160h are tested; cannot detect off-by-one between `>` and `>=` in `RebalanceService`
- [ ] **M-39** — Partial-failure test asserts thrown error message but never verifies the first quest (`task:OK-001`) was actually upserted — `upsertQuest` call count not checked

### `test/unit/DashboardService.test.ts`

- [x] **M-40** — `filterSnapshot` public method has zero test coverage — two behaviors (pass-through with `includeGraveyard: true`, filter with `false`) are never tested
- [ ] **M-41** — "Reuses graph instance" test only checks array lengths are equal — doesn't verify `WarpGraph.open` was called once or that the same instance was returned

### `test/unit/IntakeService.test.ts`

- [x] **M-42** — `describe('port interactions')` has its own `beforeEach` with `vi.clearAllMocks()` but sibling `describe` blocks do not — inconsistent mock cleanup; currently benign because each test creates fresh instances

### `xyph-actuator.ts`

- [ ] **M-43** — `quest` command doesn't validate `task:` prefix on the `id` argument (but `inbox` command does) — allows malformed node IDs into the graph
- [x] **M-44** — `--suggested-by` accepts arbitrary strings — no `human.*` / `agent.*` prefix validation; path traversal strings or garbage values written directly to graph provenance
- [x] **M-45** — `promote --intent` doesn't validate `intent:` prefix at CLI boundary — relies on adapter-layer exception with a less user-friendly error message

---

## LOW (30)

### `.gitignore`

- [x] **L-01** — Missing entries for `.env`, `coverage/`, and `*.tsbuildinfo` — secrets, coverage artifacts, and build caches can be accidentally committed

### `eslint.config.js`

- [ ] **L-02** — Files glob is `src/**/*.{ts,tsx}` — root-level entry points `xyph-actuator.ts` and `xyph-dashboard.tsx` are not linted

### `package.json`

- [ ] **L-03** — `ts-node` listed as devDependency but project migrated to `tsx` — dead dependency
- [ ] **L-04** — `ajv`, `ajv-errors`, `ajv-formats` listed as devDependencies — no usage found in source or tests; likely dead

### `scripts/backlog-update.mts`

- [x] **L-05** — Summary log says "13 sovereignty violations fixed" but 6+4+4=14 edges are wired — hardcoded count does not match code

### `scripts/graveyard-ghosts.mts`

- [ ] **L-06** — `props.get('status')` returns `unknown`, compared directly to string `'GRAVEYARD'` — works at runtime but no explicit type narrowing

### `scripts/repair-warp-graph.ts`

- [x] **L-07** — Default `WRITER_ID` is `'agent.james'` — should be `'human.james'` for a human-run script; misattributes graph authorship
- [ ] **L-08** — `campaign:TRIAGE` has `belongs-to` edge pointing to `roadmap:ROOT` which is graveyarded — campaign may be hidden or orphaned in dashboard views

### `scripts/setup-milestones-4-7.ts`

- [x] **L-09** — Log says "18 quests registered" but actual count is 4+5+4+4=17 — hardcoded and wrong
- [x] **L-10** — Default `WRITER_ID` is `'agent.james'` instead of `'human.james'` — same issue as `repair-warp-graph.ts`

### `src/coordinator-daemon.ts`

- [ ] **L-11** — Initial `heartbeat()` is fatal (exits on failure) but periodic failures are tolerated up to `MAX_CONSECUTIVE_FAILURES` — asymmetric behavior is undocumented
- [ ] **L-12** — `shutdown` calls `process.exit(0)` synchronously — in-flight heartbeat Promise abandoned; could leave graph mid-write
- [x] **L-13** — `AGENT_ID` uses `||` operator — empty string `XYPH_AGENT_ID=""` silently falls back to default; should use `??`

### `src/domain/entities/ApprovalGate.ts`

- [ ] **L-14** — `requestedBy` validation only allows `agent.*` prefix — humans cannot request approval gates; may be overly restrictive as the system evolves
- [ ] **L-15** — `resolvedAt === createdAt` is allowed — instant resolution may indicate programmatic bypass rather than genuine review

### `src/domain/entities/Quest.ts`

- [ ] **L-16** — `hours` validation allows `0` (`hours < 0` rejects only negatives) — zero-hour quests may be semantically invalid; if intentional, should be documented

### `src/domain/services/DashboardService.ts`

- [ ] **L-17** — `filterSnapshot` filters quests but leaves `scrolls`, `intents`, and `approvals` referencing removed GRAVEYARD quests — dangling references in filtered snapshot

### `src/domain/services/GuildSealService.ts`

- [ ] **L-18** — `trustDir` defaults to `path.resolve(process.cwd(), 'trust')` — key storage location depends on CWD at instantiation; silently reads/writes wrong directory if instantiated from elsewhere
- [ ] **L-19** — Private key read from disk stays in memory as `string` until garbage collected — no zeroing after `ed.sign()` completes

### `src/infrastructure/adapters/WarpDashboardAdapter.ts`

- [ ] **L-20** — `graph.neighbors()` return cast as `NeighborEntry[]` — unsafe type assertion on library return with no runtime shape check
- [ ] **L-21** — Missing `Number.isFinite()` guard on `hours` — `NaN`, `Infinity`, `-Infinity` propagate as valid (unlike `WarpRoadmapAdapter` which checks)

### `src/infrastructure/adapters/WarpIntakeAdapter.ts`

- [ ] **L-22** — `promote()` doesn't verify `intentId` / `campaignId` exist in graph before creating edges — potential dangling references

### `src/infrastructure/adapters/WarpRoadmapAdapter.ts`

- [x] **L-23** — `VALID_TYPES` includes `'scroll'`, `'milestone'`, `'campaign'`, `'roadmap'` — all unreachable due to `id.startsWith('task:')` prefix check; dead set entries
- [ ] **L-24** — `upsertQuest` uses `!= null` checks for optional properties — cannot unset a previously written property (e.g., unclaiming a quest leaves stale `assigned_to`)
- [ ] **L-25** — `buildQuestFromProps` passes negative hours from graph data to `Quest` constructor which throws — should pre-clamp to 0 or return null for invalid data

### `src/tui/Dashboard.tsx`

- [ ] **L-26** — `service.filterSnapshot(...)` called on every render without `useMemo` — creates new object reference each time, triggering unnecessary child re-renders
- [ ] **L-27** — Error state hidden behind landing screen — if graph fails to load, user won't see it until they dismiss the landing with a keypress
- [x] **L-28** — Tab only cycles forward — no Shift+Tab support for reverse view cycling

### `src/tui/HelpModal.tsx`

- [x] **L-29** — `onClose` prop declared in interface but unused (prefixed `_`) — dead prop; creates unnecessary closure allocation in parent on every render

### `src/tui/views/AllNodesView.tsx`

- [ ] **L-30** — `moveSelection` has no scroll margin — selection can sit at the very last visible row with no context below; UX nit consistent across all views

---

## NIT (26)

### `CHANGELOG.md`

- [x] **N-01** — Missing comparison link definitions at bottom of file — Keep-a-Changelog convention expects `[Unreleased]: https://...compare/v1.0.0-alpha.4...HEAD`

### `README.md`

- [ ] **N-02** — Milestones 6–8 have no cross-references or links to planning documents (e.g., RFC 001 for WEAVER)
- [ ] **N-03** — Footer omega symbol has no explanation; may confuse contributors

### `docs/canonical/RFC_001_AST_DRIVEN_INGEST.md`

- [ ] **N-04** — Section 8 conflates AstIngestService introduction and IngestService deprecation in the same milestone — ambiguous timeline
- [ ] **N-05** — Example uses `milestone:M1` but project uses `campaign:` prefix for milestones — inconsistent with established taxonomy

### `CLAUDE-XYPH-PAUSE.md`

- [x] **N-06** — Signed "Claude (Sonnet 4)" — AI model attribution in committed project documentation is unconventional

### `package.json`

- [x] **N-07** — `@typescript-eslint/eslint-plugin` and `@typescript-eslint/parser` are redundant alongside the unified `typescript-eslint` package (v8+ bundles both)

### `tsconfig.json`

- [x] **N-08** — Individual strict sub-options (`noImplicitAny`, `strictNullChecks`, etc.) are redundant — all implied by `"strict": true`; adds visual noise and maintenance burden

### `src/domain/models/dashboard.ts`

- [x] **N-09** — `ApprovalNode.trigger` typed as `string` instead of `ApprovalGateTrigger` union — loses type safety at the model layer

### `src/domain/services/GuildSealService.ts`

- [x] **N-10** — `canonicalPayload` name misleading — returns a serialized JSON string, not the payload object itself; `serializePayload` would be clearer
- [x] **N-11** — `scroll as unknown as Json` double-cast bypasses type system — could use structural typing or an explicit mapping function

### `src/tui/QuestDetailPanel.tsx`

- [x] **N-12** — `as StatusColor` cast on `STATUS_COLOR[quest.status] ?? 'white'` — unnecessary if `STATUS_COLOR` values were typed as `StatusColor` at definition time

### `src/tui/render-status.ts`

- [x] **N-13** — `scrollByQuestId` + `scrollSealedByQuestId` dual-map pattern iterates `snapshot.scrolls` twice — could be a single `Map<string, ScrollNode>`
- [x] **N-14** — Orphan quests all use `└─` tree connector — preceding orphans should use `├─` and only the last should use `└─`

### `src/tui/views/AllNodesView.tsx`, `InboxView.tsx`, `LineageView.tsx`, `RoadmapView.tsx` (N-15–N-16: keys & prop drilling)

- [x] **N-15** — Spacer row keys use loop index (`sp-${i}`) — incorrect under virtual scrolling; should use absolute index `sp-${clampedOffset + i}` to avoid React node reuse across scroll positions
- [ ] **N-16** — Full `GraphSnapshot` passed to `QuestDetailPanel` just for campaign/intent title lookups — excessive prop drilling; could pass pre-resolved strings

### `src/tui/views/InboxView.tsx`

- [x] **N-17** — `agentId` echoed in error message without truncation — long or malformed values could break TUI layout
- [x] **N-18** — `runPromote` calls `setModal(null)` before `onMutationEnd()` in `.then()` — parent may briefly think mutation is still in progress during the intermediate state

### `src/tui/views/LandingView.tsx`

- [x] **N-19** — `nextUp[0]`, `nextUp[1]`, `nextUp[2]` rendered with near-identical JSX — should use `.map()` loop
- [x] **N-20** — `qs.length === 0` condition selects empty campaigns as "current" — a future milestone with zero quests would be chosen over an in-progress one
- [ ] **N-21** — "Any key to continue / q to quit" hint text rendered here but `useInput` handler is in the parent — misleading if read in isolation

### `src/tui/views/AllNodesView.tsx`, `InboxView.tsx`, `LineageView.tsx`, `RoadmapView.tsx` (N-22: redundant useEffect)

- [x] **N-22** — `useEffect` scroll-clamping redundant with synchronous `clampedOffset` — causes an unnecessary extra render cycle in all four views

### `xyph-actuator.ts`

- [ ] **N-23** — `program.parse(process.argv)` should be `program.parseAsync(process.argv)` — async action handler rejections may produce `UnhandledPromiseRejection` instead of clean error output
- [ ] **N-24** — `--campaign` guard and dead truthiness check on a `.requiredOption()` — `'none'` escape hatch is undocumented; success message says "initialized in campaign none" contradicting the skip behavior

### `xyph-dashboard.tsx`

- [x] **N-25** — `__filename` / `__dirname` use CJS naming in ESM module — non-idiomatic; prefer `currentFilePath` / `currentDir` or add comment explaining the polyfill
- [ ] **N-26** — `?? 3` fallback on `COMPACT_LOGOS[Math.floor(Math.random() * COMPACT_LOGOS.length)]` is dead code — index is always in bounds for a non-empty constant array; satisfies `noUncheckedIndexedAccess` but is dishonest about intent

### Test files (cross-cutting)

- [x] **N-27** — Mock `addEdge: vi.fn()` returns `undefined` instead of `Promise<string>` in `CoordinatorService.test.ts` and `CoordinatorService.POWERLEVEL.test.ts` — will fail with confusing error if code ever awaits the result
- [x] **N-28** — `DashboardService.test.ts` reaches into `vi.mocked(...).mock.results[0]` — brittle dependency on vitest internal mock API; should use `baseSnapshot.campaigns[0]!` directly
- [x] **N-29** — `ApprovalGate.test.ts` — no test for `resolvedAt === createdAt` boundary (instant resolution); no test for negative `createdAt`
- [x] **N-30** — `IntakeService.test.ts` — "resolves for agent actor" test is a duplicate of the standard `validateReject` test; the method doesn't take an actor parameter so the test proves nothing additional
