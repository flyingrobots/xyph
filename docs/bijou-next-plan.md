# Bijou 0.10.0 — Next Adoption Wave

## Context

The first adoption wave (overlays, statusBar, toast, helpView, canvas) replaced
~130 lines of hand-rolled code with bijou builtins. This plan covers the second
wave: five features that add new capabilities rather than just replacing existing
code.

**Goal:** Ship each feature as an independent, testable increment. No phase
requires another to land first (except where noted).

---

## Phase A: Navigable Table — `navigableTable()`

**Replaces:** Manual `selectedIndex` + `clampIndex` + scroll tracking in 3 views
(roadmap, submissions, backlog).

### Current Pain

Every view duplicates the same pattern:
- `selection-order.ts` computes a canonical ID list
- `DashboardApp.ts:selectDelta()` calls `clampIndex(idx + delta, count)` per view
- View renderers re-derive the same list to find the selected item
- Scroll offsets tracked manually with no viewport auto-follow

### What Changes

**`selection-order.ts`** — New function per view that returns `string[][]` (rows)
instead of `string[]` (IDs). Each row is `[indicator, id, title, status, ...]` —
the same data the view currently computes inline.

**`DashboardModel`** — Replace per-view state with `NavigableTableState`:
```typescript
// Before:
roadmap: { selectedIndex: number; dagScrollY: number; dagScrollX: number; detailScrollY: number }

// After:
roadmap: { table: NavigableTableState; dagScrollY: number; dagScrollX: number; detailScrollY: number }
```

**`DashboardApp.ts`** — Replace `selectDelta()` with bijou's
`navTableFocusNext()` / `navTableFocusPrev()`. The `clampIndex()` helper can
be deleted. On `snapshot-loaded`, rebuild table state via
`createNavigableTableState()` with the new row data.

**View renderers** — Call `navigableTable(model.roadmap.table)` instead of
manually iterating items with highlight logic.

### Scope

| File | Change |
|------|--------|
| `selection-order.ts` | Add `roadmapRows()`, `submissionRows()`, `backlogRows()` |
| `DashboardApp.ts` | Replace 3 state shapes + `selectDelta()` + `clampIndex()` |
| `roadmap-view.ts` | Replace left-panel list rendering |
| `submissions-view.ts` | Replace list rendering |
| `backlog-view.ts` | Replace list rendering |
| `DashboardApp.test.ts` | Update model factories + selection assertions |
| `views.test.ts` | Update model factories |

### Risk: **Medium-High**

Largest model shape change. Every test that constructs a `DashboardModel` must
update. The selection-order invariant (DashboardApp and views use same ordering)
is preserved because both consume the same `NavigableTableState`.

### Strategy

1. Add `NavigableTableState` to model **alongside** existing `selectedIndex` (dual state).
2. Migrate one view at a time (backlog first — simplest, fewest tests).
3. Once all three views use `NavigableTableState`, delete `selectedIndex` + `clampIndex`.

---

## Phase B: Drawer — `drawer()` for Roadmap Detail Panel

**Replaces:** Fixed-width right panel in roadmap flex layout (~28 chars).

### Current Pain

The detail panel always occupies 28 columns, even when nothing is selected
(it renders empty). This wastes ~23% of terminal width on the most complex view.

### What Changes

**`roadmap-view.ts`** — When `selectedIndex >= 0`, render the detail panel as
a `drawer()` overlay instead of a flex column:

```typescript
// Before: flex row with 4 children (frontier | separator | DAG | detail)
// After:  flex row with 2 children (frontier | DAG), then:
if (selectedQuestId) {
  const detail = renderDetailContent(quest, snap, ...);
  const panel = drawer({
    content: detail,
    anchor: 'right',
    width: Math.min(40, Math.floor(w * 0.35)),
    screenWidth: w,
    screenHeight: h,
    title: selectedQuestId,
    borderToken: t.theme.border.primary,
  });
  return composite(baseLayout, [panel]);
}
```

**No model changes.** The detail panel state (`detailScrollY`) stays as-is.

### Scope

| File | Change |
|------|--------|
| `roadmap-view.ts` | Replace flex column with drawer overlay |
| `views.test.ts` | Verify detail content still appears when selected |

### Risk: **Low**

Pure view-layer swap. No model or update changes. The drawer width can be
responsive (percentage-based with min/max). Tests only check for content
presence, not layout structure.

---

## Phase C: Command Palette — `createCommandPaletteState()`

**New feature.** Adds a `:` or `/` activated command palette for discovering
and invoking dashboard actions.

### Design

1. Register all actions as `CommandPaletteItem[]`:
   ```typescript
   { id: 'claim',     label: 'Claim quest',       category: 'Roadmap',     shortcut: 'c' },
   { id: 'promote',   label: 'Promote to backlog', category: 'Backlog',     shortcut: 'p' },
   { id: 'approve',   label: 'Approve patchset',  category: 'Submissions', shortcut: 'a' },
   { id: 'refresh',   label: 'Refresh snapshot',  category: 'Global',      shortcut: 'r' },
   // ...
   ```

2. New mode in `DashboardModel`:
   ```typescript
   mode: 'normal' | 'confirm' | 'input' | 'palette';
   paletteState: CommandPaletteState | null;
   ```

3. Key handling:
   - `:` or `/` in normal mode → enter palette mode, `createCommandPaletteState(items)`
   - Typing → `cpFilter(state, query)`
   - `j`/`k` or arrows → `cpFocusNext()`/`cpFocusPrev()`
   - `Enter` → dispatch `cpSelectedItem(state)` action, exit palette
   - `Escape` → exit palette

4. Rendering: `commandPalette(state, { width, showCategory: true, showShortcut: true })`
   composited as a modal overlay.

### Scope

| File | Change |
|------|--------|
| `DashboardApp.ts` | Add `'palette'` mode, palette state, key handler, dispatch |
| `DashboardApp.ts` | New `buildPaletteItems()` function |
| `DashboardApp.ts` | In `view()`, composite palette overlay when active |
| `DashboardApp.test.ts` | New test block for palette mode |

### Risk: **Low-Medium**

Additive — new mode doesn't touch existing modes. The only integration point
is mapping `cpSelectedItem().id` back to the existing action dispatch
(`handleViewAction` or `globalAction`). Some actions are context-dependent
(claim requires a selected quest), so the palette should grey out or
skip inapplicable actions.

### Depends on: Nothing. Can ship independently.

---

## Phase D: Wizard Flows — `wizard()` for Interactive CLI

**New feature.** Adds guided multi-step flows for `quest`, `review`,
`promote`, and `triage` commands when invoked without flags.

### Design

Each command checks: if required flags are provided, run headless (existing
behavior). If not, launch `wizard()`.

**`xyph quest` (interactive):**
```typescript
const result = await wizard<QuestWizardValues>({
  steps: [
    { key: 'campaignId', field: (v) => filter(campaignOptions, { title: 'Campaign' }) },
    { key: 'questId',    field: (v) => input({ title: 'Quest ID', default: nextId(v.campaignId) }) },
    { key: 'title',      field: () => input({ title: 'Title' }) },
    { key: 'hours',      field: () => input({ title: 'Hours (optional)' }), skip: () => false },
    { key: 'deps',       field: () => filter(taskOptions, { title: 'Dependencies', multi: true }),
                          skip: (v) => taskOptions.length === 0 },
  ],
});
if (!result.cancelled) await actuator.quest(result.values);
```

**`xyph review` (interactive):**
```typescript
const result = await wizard<ReviewWizardValues>({
  steps: [
    { key: 'submissionId', field: () => filter(openSubmissions, { title: 'Submission' }) },
    { key: 'verdict',      field: () => select({ title: 'Verdict', options: verdictOptions }) },
    { key: 'comment',      field: () => textarea({ title: 'Comment' }) },
  ],
});
```

**`xyph promote` (interactive):**
```typescript
const result = await wizard<PromoteWizardValues>({
  steps: [
    { key: 'questId',    field: () => filter(inboxItems, { title: 'Inbox item' }) },
    { key: 'intentId',   field: () => filter(intents, { title: 'Authorizing intent' }) },
    { key: 'campaignId', field: () => filter(campaigns, { title: 'Target campaign' }),
                          skip: (v) => campaigns.length <= 1 },
  ],
});
```

### Scope

| File | Change |
|------|--------|
| `xyph-actuator.ts` | Detect missing flags → launch wizard |
| `src/cli/wizards/quest-wizard.ts` | New file |
| `src/cli/wizards/review-wizard.ts` | New file |
| `src/cli/wizards/promote-wizard.ts` | New file |
| `src/cli/wizards/triage-wizard.ts` | New file (loop-based session) |
| Tests | Integration tests per wizard |

### Risk: **Low**

Pure additive. Existing headless paths are untouched. Wizards are new code paths
that call the same domain ports. Triage wizard is the most complex (loop mode).

### Depends on: Nothing. Can ship independently.

---

## Phase E: runScript — TUI Integration Tests

**New capability.** Drive the full TEA loop with scripted key sequences and
assert on rendered frames.

### Design

```typescript
import { runScript } from '@flyingrobots/bijou-tui';

it('claim flow: select quest → c → y → shows toast', async () => {
  const app = makeApp();
  const result = await runScript(app, [
    { key: 'a', delay: 100 },    // dismiss landing (after snapshot loads)
    { key: '\t' },                // tab to roadmap
    { key: 'j' },                // select first quest
    { key: 'c' },                // claim
    { key: 'y', delay: 50 },     // confirm
  ]);

  // Assert on frames
  expect(result.frames.some(f => f.includes('Claim'))).toBe(true);
  expect(result.model.mode).toBe('normal');
  expect(result.model.writePending).toBe(true);
});
```

### Key Considerations

- `runScript` uses microtask yielding between steps. Async commands
  (`fetchSnapshot`, `claimQuest`) use macrotasks (Promises). Use `delay`
  on steps that follow async operations.
- Mock ports must resolve synchronously or within the delay window.
- Frame capture via `onFrame` callback enables GIF-like visual regression.

### Scope

| File | Change |
|------|--------|
| `src/tui/bijou/__tests__/integration.test.ts` | New file |
| Test helpers | May need synchronous mock factories |

### Risk: **Low**

Pure additive. No production code changes. The main risk is flaky timing
with async commands — mitigated by generous `delay` values and synchronous
mocks.

### Depends on: Nothing. Can ship independently.

---

## Execution Order

```
Independent — can run in parallel:
  Phase B (Drawer)        — smallest, lowest risk, immediate visual win
  Phase D (Wizards)       — high value, independent codebase area (CLI)
  Phase E (runScript)     — testing infra, helps validate everything else

Sequential:
  Phase A (NavTable)      — largest, do after B/D/E stabilize the branch
  Phase C (Palette)       — after A, since palette dispatches to the same
                            action system that A refactors
```

**Recommended order:** B → D → E → A → C

| Phase | Feature | New Files | Model Change | Risk | Depends On |
|-------|---------|:---------:|:------------:|:----:|:----------:|
| B | Drawer | 0 | None | Low | — |
| D | Wizards | 4 | None | Low | — |
| E | runScript | 1 | None | Low | — |
| A | NavTable | 0 | **Yes** | Med-High | — |
| C | Palette | 0 | **Yes** | Low-Med | — |

---

## Verification

```bash
npm run build    # After each phase
npm run test:local   # After each phase
```

Manual TUI verification after Phase A (selection behavior) and Phase B (drawer
appearance). Phase D requires manual wizard walkthrough. Phase E is self-verifying
(it IS the test).
