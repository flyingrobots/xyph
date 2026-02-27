# XYPH Interactive TUI — Full Dashboard Plan

## Context

The XYPH TUI dashboard is currently read-only with 4 views (roadmap, lineage, all, inbox). The domain has rich data (submissions, reviews, decisions, sovereignty audits) and write operations (claim, promote, reject, review) that aren't surfaced. The goal is to make the TUI the **primary interface** — fully interactive, with all key data and operations accessible.

Quick win (DAG labels → task IDs) already shipped.

---

## Phase 1: New Views + Selection (no bijou spec deps)

### 1a. Model & Architecture Changes

**File: `src/tui/bijou/DashboardApp.ts`**

Expand `ViewName` and add per-view state:

```typescript
type ViewName = 'roadmap' | 'submissions' | 'lineage' | 'overview' | 'inbox';
// Tab order: roadmap → submissions → lineage → overview → inbox

interface DashboardModel {
  // ... existing fields (keep all) ...
  // REMOVE: dagScrollY (moves into roadmap state)

  // NEW: per-view state
  roadmap: {
    selectedIndex: number;        // index into sorted quest list (-1 = none)
    dagScrollY: number;           // moved from top-level
    detailScrollY: number;        // for future detail panel
  };
  submissions: {
    selectedIndex: number;        // index into submission list
    expandedId: string | null;    // which submission is showing detail
    listScrollY: number;
    detailScrollY: number;
  };
  inbox: {
    selectedIndex: number;        // index into inbox quest list
    listScrollY: number;
  };

  // NEW: interaction mode
  mode: 'normal' | 'confirm' | 'input';
  confirmState: { prompt: string; action: DashboardMsg } | null;
  inputState: { label: string; value: string; onSubmit: string } | null;

  // NEW: toast notifications
  toast: { message: string; variant: 'success' | 'error'; expiresAt: number } | null;
}
```

Replace single `KeyMap` with `createInputStack` for layered keymaps:
- Base layer (passthrough): quit, tab, shift+tab, r, ?, Esc
- View layer (swapped on view change): view-specific j/k/Enter/action keys
- Modal layer (opaque, pushed for confirm/input): y/n/Enter/Esc

Add new message types: `write-success`, `write-error`, `dismiss-toast`, `confirm-yes`, `confirm-no`, plus per-view selection/scroll messages.

### 1b. Overview View (replaces All)

**New file: `src/tui/bijou/views/overview-view.ts`**

Summary dashboard with box panels, not raw tables:

```
┌ Quest Status ────┐  ┌ Submissions ─────┐  ┌ Health ──────────────┐
│ DONE         12  │  │ OPEN          3  │  │ Sovereignty: 14/15   │
│ IN_PROGRESS   4  │  │ APPROVED      1  │  │ Orphan quests: 1     │
│ PLANNED       8  │  │ MERGED        7  │  │ Forked patchsets: 0  │
│ BACKLOG       3  │  │ CLOSED        2  │  │                      │
│ INBOX         5  │  │ CHANGES_REQ   1  │  │                      │
└──────────────────┘  └──────────────────┘  └──────────────────────┘

┌ Campaigns ──────────────────────────┐  ┌ Graph Meta ────────────┐
│ M4 SOVEREIGNTY          DONE       │  │ Max tick: 147          │
│ M5 DASHBOARD            DONE       │  │ My tick: 44            │
│ M6 SUBMISSIONS          IN_PROGRESS│  │ Writers: 4             │
│ M7 WEAVER               DONE       │  │ Tip: abc1234           │
└─────────────────────────────────────┘  └────────────────────────┘
```

Data sources:
- Quest status counts: group `snap.quests` by status
- Submission status counts: group `snap.submissions` by status
- Sovereignty: quests with `intentId` vs without (exclude INBOX)
- Forked patchsets: `snap.submissions.filter(s => s.headsCount > 1).length`
- Campaigns: `snap.campaigns`
- Graph meta: `snap.graphMeta`

### 1c. Submissions View

**New file: `src/tui/bijou/views/submissions-view.ts`**

Master-detail layout (30/70 split via flex):

**Left panel — submission list:**
- Sorted: OPEN first, then CHANGES_REQUESTED, APPROVED, then MERGED/CLOSED
- Each entry: submission ID, quest ID, submitter, approval count, status badge
- Selected item highlighted (bold/inverse)

**Right panel — detail (when expanded):**
- Submission metadata: quest title, submitter, date, computed status
- Patchset chain: vertical list showing tip → supersedes → ... chain
- Reviews on tip patchset: verdict + reviewer + comment
- Decision (if any): kind + rationale + merge commit

Data sources:
- `snap.submissions` for list
- `snap.reviews` filtered by tip patchset ID
- `snap.decisions` filtered by submission ID
- Quest title from `snap.quests` lookup

### 1d. Selection in Existing Views

**Roadmap** (`roadmap-view.ts`): Accept `selectedIndex` from model. In frontier panel, highlight the selected quest with bold/primary styling. The sorted quest list provides the index mapping.

**Inbox** (`inbox-view.ts`): Accept `selectedIndex`. Highlight selected inbox item. Flatten grouped-by-suggester list into ordered array for index mapping.

### 1e. Keybinding Scheme

**Global (base layer, passthrough):**
| Key | Action |
|-----|--------|
| `q` | Quit |
| `Ctrl+C` | Force quit |
| `Tab` | Next view |
| `Shift+Tab` | Prev view |
| `r` | Refresh |
| `?` | Help |
| `Esc` | Cancel modal / back |

**Roadmap view layer:**
| Key | Action |
|-----|--------|
| `j` / `↓` | Select next quest |
| `k` / `↑` | Select prev quest |
| `c` | Claim selected quest |
| `PgDn` / `PgUp` | Scroll DAG |

**Submissions view layer:**
| Key | Action |
|-----|--------|
| `j` / `↓` | Select next submission |
| `k` / `↑` | Select prev submission |
| `Enter` | Expand/collapse detail |

**Inbox view layer:**
| Key | Action |
|-----|--------|
| `j` / `↓` | Select next item |
| `k` / `↑` | Select prev item |
| `p` | Promote selected |
| `d` | Reject selected |

### 1f. Write Operations

**New file: `src/tui/bijou/write-cmds.ts`**

Cmd factories for write operations. Each returns `Cmd<DashboardMsg>` that:
1. Performs the write via the appropriate port
2. Emits `write-success` or `write-error`
3. Chains a snapshot refresh (with incremented requestId)

Operations for Phase 1:
- `claimQuest(questId)` — via direct graph patch (set status, assignedTo, claimedAt)
- `promoteQuest(questId, intentId, campaignId?)` — via `IntakePort.promote()`
- `rejectQuest(questId, rationale)` — via `IntakePort.reject()`

**Confirmation flow:** Action key → set `mode: 'confirm'` with prompt → `y` dispatches exec message → Cmd runs write → toast result.

**Input flow (reject rationale):** Action key → set `mode: 'input'` with label → type text → `Enter` dispatches exec with value → Cmd runs write → toast result.

### 1g. Toast Notifications

Render in status line area. Success = green, error = red. Auto-dismiss after 3s via `setTimeout` Cmd that emits `dismiss-toast`.

### 1h. Overlay Rendering

**New file: `src/tui/bijou/overlays.ts`**

Simple confirm dialog and text input rendered as centered box over the view content. Implementation: split rendered output into lines, replace center rows with bordered box containing the modal content.

### 1i. Entry Point Changes

**File: `xyph-dashboard.tsx`**

Wire `GraphPort` (for direct graph patches in claim) into `DashboardDeps`. The `IntakePort` is already wired.

```typescript
interface DashboardDeps {
  ctx: GraphContext;
  intake: IntakePort;
  graphPort: GraphPort;    // NEW — for claim via graph.patch()
  agentId: string;
  logoText: string;
}
```

---

## Phase 2: Review Actions + Roadmap Detail (needs bijou specs 3, 4)

After bijou ships `selectedId` (spec 3) and exported ANSI utils (spec 4):

- Submissions view: `a` (approve) and `x` (request-changes) hotkeys with comment input
- Roadmap: DAG highlights selected node via `selectedId` option
- Roadmap: detail panel (third flex column) showing quest metadata when selected

---

## Phase 3: Full DAG Interactivity (needs bijou specs 1, 2, 5)

After bijou ships `scrollX` (spec 1), `dagLayout` (spec 2), `createPanelGroup` (spec 5):

- Horizontal scrolling for wide DAGs
- Auto-scroll viewport to keep selected node visible
- Panel focus cycling within roadmap (frontier | DAG | detail)
- DAG filtering by campaign / status / subtree (`dagSlice`)

---

## Files Summary

### New files
| File | Purpose |
|------|---------|
| `src/tui/bijou/views/overview-view.ts` | Summary dashboard (replaces all-view) |
| `src/tui/bijou/views/submissions-view.ts` | Master-detail submissions |
| `src/tui/bijou/write-cmds.ts` | Write Cmd factories |
| `src/tui/bijou/overlays.ts` | Confirm dialog + text input overlays |
| `src/tui/bijou/__tests__/overview-view.test.ts` | Overview tests |
| `src/tui/bijou/__tests__/submissions-view.test.ts` | Submissions tests |

### Modified files
| File | Changes |
|------|---------|
| `src/tui/bijou/DashboardApp.ts` | ViewName expansion, per-view state, InputStack, modal modes, write flow, toast, overlay rendering |
| `src/tui/bijou/views/roadmap-view.ts` | Accept selectedIndex, highlight in frontier |
| `src/tui/bijou/views/inbox-view.ts` | Accept selectedIndex, highlight selected item |
| `xyph-dashboard.tsx` | Wire GraphPort into deps |
| `src/tui/bijou/__tests__/DashboardApp.test.ts` | New view switching, write flows, modal tests |
| `src/tui/bijou/__tests__/views.test.ts` | Updated for overview-view (replacing all-view) |

### Deleted files
| File | Reason |
|------|--------|
| `src/tui/bijou/views/all-view.ts` | Replaced by overview-view |

---

## Verification

```bash
npx tsc --noEmit           # TypeScript compilation
npm run test:local          # Full test suite
./xyph-dashboard.tsx        # Visual check — cycle through all 5 views
```

Manual checks:
- Tab cycles: roadmap → submissions → lineage → overview → inbox
- j/k selects in roadmap frontier, submissions list, inbox list
- `c` on roadmap shows confirm → `y` claims quest → toast
- `p` on inbox shows intent select → confirm → promotes → toast
- `d` on inbox shows rationale input → confirm → rejects → toast
- Overview shows accurate counts matching `status --view all`
- Submissions detail shows patchset chain and reviews
