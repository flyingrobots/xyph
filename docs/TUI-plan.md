# XYPH Interactive TUI — Full Dashboard Plan

> **Current state (2026-03-19):** This document is now partly historical.
> XYPH runs on BIJOU 3.1.0, and the current shell is a single AION-style
> cockpit rather than six peer dashboards. The live shell has five lanes
> (`Now`, `Plan`, `Review`, `Settlement`, `Campaigns`) over one worklist and
> one inspector. Treat the remaining sections here as backlog/design context
> rather than an exact description of the current implementation.

> **Note:** The canonical contract for the agent-native CLI and action kernel
> now lives in [`docs/canonical/AGENT_PROTOCOL.md`](docs/canonical/AGENT_PROTOCOL.md).
> The agent-command sections in this file are design context for the TUI, not
> the authoritative protocol spec.

## Context

The XYPH TUI dashboard is currently read-only with 4 views (roadmap, lineage, all, inbox). The domain has rich data (submissions, reviews, decisions, sovereignty audits) and write operations (claim, promote, reject, review) that aren't surfaced. The goal is to make the TUI the **primary interface** — fully interactive, with all key data and operations accessible.

Quick win (DAG labels → task IDs) already shipped.

---

## Phase 1: New Views + Selection (no bijou spec deps) ✅ DONE

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

```text
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

**File: `xyph-dashboard.ts`**

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

## Phase 2: Review Actions + Roadmap Detail ✅ DONE

Implemented without bijou specs 3/4 (workarounds: `DagNode.token` for highlighting, ANSI utils not needed).

- Submissions view: `a` (approve) and `x` (request-changes) hotkeys with comment input
- Roadmap: DAG highlights selected node via `token` field override (primary color)
- Roadmap: detail panel (third flex column, 28 cols) showing quest metadata when selected

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
| `xyph-dashboard.ts` | Wire GraphPort into deps |
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
./xyph-dashboard.ts        # Visual check — cycle through all 5 views
```

Manual checks:

- Tab cycles: roadmap → submissions → lineage → overview → inbox
- j/k selects in roadmap frontier, submissions list, inbox list
- `c` on roadmap shows confirm → `y` claims quest → toast
- `p` on inbox shows intent select → confirm → promotes → toast
- `d` on inbox shows rationale input → confirm → rejects → toast
- Overview shows accurate counts matching `status --view all`
- Submissions detail shows patchset chain and reviews

---

## UX Polish Batch ✅ DONE

10 items shipped in a single commit — see PR #22 for details:

1. Frontier auto-scroll to selection
2. WARP gutter status line (`// [WARP(tip) tick: N] ///...///`)
3. Hints moved below WARP gutter, compact format
4. Logo line shifting fix (pad to max width)
5. Pulsing "Press any key" via looping tween
6. Gradient logo via `gradientText()` + theme brand stops
7. Drawer-style frontier panel (header + `│` separator)
8. Submissions layout fix (inline header, flat row flex)
9. Lineage expand/collapse (accordion with j/k/Enter)
10. Overview flex panels (replaces manual `padEnd`)

---

## Phase 4: Lineage View Enhancement — Intent Cards

### Problem

The lineage view currently shows a graph-structure dump: intent IDs, quest trees, scroll marks. It answers "what's the graph shape?" but not "what did I ask for, and what happened?"

As a human user, intents are your sovereignty anchor — every quest traces back to your explicit authorization. The view should tell that story: what you wanted, why, and how far along each intent's work has progressed.

### Data Gaps

**IntentNode today:**

```typescript
interface IntentNode {
  id: string;
  title: string;
  requestedBy: string;
  createdAt: number;
}
```

**Missing from snapshot (but stored in graph):**

- `description?: string` — the Intent entity supports it, the actuator stores it via `--description`, but `GraphContext.fetchSnapshot()` doesn't read it

**Missing entirely (needs derivation):**

- Quest count per intent
- Completion ratio (done / total)
- Total hours allocated & completed
- Submission status summary (how many quests have open/merged submissions)

### Design

#### 4a. Surface `description` in IntentNode

Add `description?: string` to `IntentNode` in `dashboard.ts`. Read `n.props['description']` in `GraphContext.fetchSnapshot()` and pass it through. Zero risk — additive field, no existing consumers break.

#### 4b. Derived intent stats

Compute per-intent stats at render time from snapshot data (no new graph queries):

```typescript
interface IntentStats {
  questCount: number;
  doneCount: number;
  totalHours: number;
  doneHours: number;
  openSubmissions: number;
  mergedSubmissions: number;
}
```

Build in `lineage-view.ts` by grouping `snap.quests` and `snap.submissions` by `intentId`.

#### 4c. Card layout

Each intent renders as a card when collapsed:

```text
▶ ◆ intent:DASHBOARD  Build the WARP Dashboard
  requested-by: human.james  ·  2026-01-15
  Interactive TUI for graph navigation, triage, and observability.
  ████████░░░░░░░░░░  5/12 quests  ·  18h done / 31h total
```

Card shows:

- Title + ID (existing)
- requestedBy + createdAt formatted as date (existing data)
- Description (new — from graph)
- Progress bar + completion stats (derived)

When expanded (Enter), the quest tree appears below the card:

```text
▼ ◆ intent:DASHBOARD  Build the WARP Dashboard
  requested-by: human.james  ·  2026-01-15
  Interactive TUI for graph navigation, triage, and observability.
  ████████░░░░░░░░░░  5/12 quests  ·  18h done / 31h total
  ├─ task:BJU-001  Theme bridge  [DONE] ✓
  │    scroll: artifact:task:BJU-001
  ├─ task:BJU-002  Port render-status  [IN_PROGRESS]
  ├─ task:BJU-003  TEA app shell  [DONE] ✓
  ...
```

#### 4d. Orphan quests section

Keep existing orphan warning but enhance: show count prominently at top as a "sovereignty health" indicator, not buried at the bottom.

### Files

| File | Changes |
|------|---------|
| `src/domain/models/dashboard.ts` | Add `description?: string` to `IntentNode` |
| `src/infrastructure/GraphContext.ts` | Read `description` prop in intent materialization |
| `src/tui/bijou/views/lineage-view.ts` | Card layout, derived stats, progress bar |
| `src/tui/bijou/__tests__/views.test.ts` | Updated lineage assertions |

### Verification

```bash
npx tsc --noEmit
npm run test:local
./xyph-dashboard.ts   # Tab to lineage — verify cards, expand/collapse, progress bars
```

Manual checks:

- Cards show description when present, graceful when absent
- Progress bar reflects actual done/total ratio
- Expanded view still shows quest tree with scroll marks
- Orphan section visible at bottom with count

---

## Phase 5: Overview View Redesign — Project Dashboard

### Problem

Overview is currently a data dump: raw status counts, a big campaign table, graph meta. It doesn't answer the questions a user actually has when opening the dashboard:

- What's happening right now?
- What needs my attention?
- How far along is the project?

Layout issues: doesn't fill screen width, header box truncates, completed milestones bury active work.

### Design Principles

1. **Overview is the default view** — change `activeView` init from `'roadmap'` to `'overview'`
2. **Active work first** — completed stuff goes under folds, not at the top
3. **Personal relevance** — "My Issues" shows what's assigned to me
4. **Project identity** — show a project name prominently

### Project Name Source

Options (in priority order):

1. Graph property on a well-known config node (e.g., `config:project` → `name` prop) — most "XYPH native"
2. Git repo name from remote URL or directory basename — zero config
3. Fallback: `"XYPH"` literal

Start with option 2 (git repo name) as the default. Add a `config:project` node to the graph later if users want to customize. Pass `projectName: string` into `DashboardDeps`.

### Layout

```text
  XYPH — xyph                                        ████████████░░░░░░░  61% (72/118)
  ─────────────────────────────────────────────────────────────────────────────────────

  ▶ In Progress (1)                        │  My Issues (agent.james)
    task:BJU-002  Port render-status…  4h  │    2 assigned tasks
                                           │    0 submissions awaiting review
  ▶ Pending Review (2)                     │
    submission:S1  Quest A  [OPEN]         │  Health
    submission:S2  Quest B  [OPEN]         │    Sovereignty: 79/81
                                           │    Orphan quests: 2
  ▶ Campaigns (4 active)                   │    Graveyard: 3
    M5 DASHBOARD     ████████░░  5/12      │
    M6 SUBMISSION    ██████████  10/10     │  Graph
    M7 WEAVER        ██████░░░░  6/11      │    tick: 186 · writers: 5
    M10 CLITOOL      ░░░░░░░░░░  0/8       │    tip: 5373bfc
                                           │
  ▸ Completed (5 campaigns)                │  Latest Activity
  ▸ Graveyard (3 quests)                   │    ● task:BJU-002 claimed by agent.prime
                                           │    ● submission:S1 opened by agent.james
                                           │    ● review:R3 approved by human.james
                                           │    ● task:LIN-001 added to INBOX
```

### Sections

#### 5a. Project header with overall progress

Top line: project name + overall progress bar. Progress = done quests / total non-INBOX quests (INBOX is unplanned, shouldn't count against completion). Show percentage + fraction.

#### 5b. In Progress section

Quests with `status === 'IN_PROGRESS'`. Show task ID, title (truncated), hours, assignee. Compact — one line per quest.

#### 5c. Pending Review section

Open/changes-requested submissions. Show submission ID, quest title, status badge. Gives the user a clear "what needs attention" signal.

#### 5d. Campaigns with progress bars

Group by status: active (IN_PROGRESS) first, then BACKLOG, then completed under a fold. Each campaign shows:

- Short ID + title
- `progressBar()` showing done/total quest ratio for that campaign
- Quest fraction label

Sort within each group: most-progressed first.

#### 5e. Completed fold

Collapsed by default. Shows completed campaigns and done quest count. Expand to see the list. Uses the same accordion pattern from lineage view.

#### 5f. Graveyard fold

Collapsed by default. Shows count of graveyard quests. Expand to see IDs + rejection rationale. Surfaces data that's currently invisible.

#### 5g. My Issues (right column)

Personalized section based on `agentId`:

- Assigned tasks: quests where `assignedTo === agentId` and status is non-terminal
- Submissions awaiting review: submissions where I'm NOT the submitter and status is OPEN/CHANGES_REQUESTED (i.e., things I might need to review)

#### 5h. Health panel (right column)

Compact version of current health metrics: sovereignty ratio, orphan count, forked patchsets, graveyard count.

#### 5i. Graph Meta (right column)

Compact: `tick: N · writers: N · tip: XXXXXX` — one or two lines.

#### 5j. Latest Activity feed (right column)

Derive from snapshot timestamps. Collect all timestamped events (quest claims, submissions, reviews, decisions, inbox additions), sort by recency, show latest N (5-8 items). Each entry: bullet + entity ID + action + actor.

`graph.watch()` is now wired into the TEA loop (task:BJU-009): `startWatching()` fires from `init()`, polling every 10s and emitting `remote-change` messages for `task:*` pattern changes.

#### 5k. Alert bar

Compact line at the top surfacing actionable problems:

```text
⚠ 2 orphan quests · 1 stale claim (14d) · 1 approval gate pending
```

Sources:

- Sovereignty violations (orphan quests without intent lineage)
- Stale claims: IN_PROGRESS quests with no submission and `claimedAt` older than N days
- Forked patchsets needing resolution
- Pending approval gates requiring human sign-off

#### 5l. Inbox pressure

Prominent call-to-action: `📥 37 items awaiting triage · oldest: 12 days`. Not buried in a tab — the dashboard tells you there's a backlog building up.

#### 5m. Dependency blockers summary

Count from Weaver data: "3 quests blocked" linking to the roadmap frontier. Tells you at a glance if there's a scheduling bottleneck without switching views.

#### 5n. Writer activity

Who's contributing: `agent.james: 12 patches · human.james: 3 patches · last 7d`. Derived from writer frontier ticks or patch counts. Shows collaboration health.

#### 5o. Quick actions

Keyboard shortcuts available directly from the dashboard:

- `c` claim next frontier quest (auto-selects top frontier item)
- `p` promote top inbox item
- Jump-to-view shortcuts for deeper drill-down

#### 5p. Campaign focus mode

Select a campaign to filter the entire dashboard to just that milestone's quests/submissions/reviews. Like a sprint view. `f` to enter focus, `Esc` to clear.

### Naming

Rename "overview" → "dashboard" everywhere:

- `ViewName` type: `'dashboard'` replaces `'overview'`
- Tab bar label
- File name: `dashboard-view.ts` (rename from `overview-view.ts`)

### Model Changes

```typescript
interface DashboardViewState {
  completedExpanded: boolean;
  graveyardExpanded: boolean;
  focusCampaignId: string | null;  // campaign focus mode
}
```

Add to `DashboardModel`. Add keybindings for fold interaction and quick actions.

### Default View Change

In `DashboardApp.ts` `init()`, change `activeView: 'roadmap'` → `activeView: 'dashboard'`.

### Files

| File | Changes |
|------|---------|
| `src/domain/models/dashboard.ts` | (none — all data already in snapshot) |
| `src/tui/bijou/DashboardApp.ts` | Rename view, default view, DashboardViewState, keybindings, quick actions |
| `src/tui/bijou/views/dashboard-view.ts` | Full rewrite (renamed from overview-view.ts) |
| `xyph-dashboard.ts` | Pass `projectName` from git repo name |
| `src/tui/bijou/__tests__/DashboardApp.test.ts` | Default view assertion, DashboardViewState |
| `src/tui/bijou/__tests__/views.test.ts` | Updated assertions |

### Verification

```bash
npx tsc --noEmit
npm run test:local
./xyph-dashboard.ts   # Should open to dashboard, not roadmap
```

Manual checks:

- Dashboard fills terminal width
- Alert bar shows actionable issues at top
- Overall progress bar matches quest completion ratio
- In-progress quests visible, pending submissions visible
- Campaigns sorted: active first with progress bars, completed folded
- Inbox pressure indicator shows count + age
- Graveyard folded with count
- My Issues shows assigned tasks
- Latest Activity shows recent events
- Quick actions (c/p) work from dashboard
- Campaign focus mode filters content

---

## Phase 6: Agent Dashboard — Machine-Native Interface

### Problem

The TUI is designed for humans: visual layouts, colors, keyboard navigation, progress bars. But XYPH's core philosophy is that **agents are first-class causal participants**. They need an interface that's native to how they work:

- Structured data, not visual layouts
- Information-dense, context-window efficient
- Clear action menus with preconditions
- Machine-parseable output with human-readable debug mode

Currently agents interact through raw CLI commands and graph queries. There's no curated "here's what's going on and what you should do" interface. Every agent session starts with expensive orientation: reading files, running status commands, piecing together project state.

### Design Principles

1. **Structured first** — JSON primary output, human-readable text as debug mode
2. **Context-window efficient** — an agent shouldn't need 10 tool calls to understand project state
3. **Decision support** — don't just show data, show what actions are available and why
4. **Auditable** — every agent action through this interface is logged to the WARP graph
5. **Same graph, different lens** — agents and humans see the same truth, just formatted differently

### Commands

#### 6a. `xyph agent-briefing` — Session Start Context

The most important command. An agent runs this once at the start of a session to orient itself. Returns a structured document with everything needed to be productive:

```bash
xyph agent-briefing [--format json|text|markdown]
```

**JSON output:**

```json
{
  "project": {
    "name": "xyph",
    "description": "Causal Operating System for Agent Planning",
    "progress": { "done": 72, "total": 118, "percent": 61 }
  },
  "identity": {
    "writerId": "agent.claude",
    "principal": "agent",
    "capabilities": ["claim", "submit", "revise", "review"]
  },
  "myAssignments": [
    {
      "id": "task:BJU-002",
      "title": "Port render-status.ts to bijou components",
      "status": "IN_PROGRESS",
      "hours": 4,
      "claimedAt": "2026-02-20T...",
      "daysSinceClaim": 7,
      "submission": null,
      "nextAction": "submit or continue working"
    }
  ],
  "reviewQueue": [
    {
      "submissionId": "submission:S1",
      "questTitle": "Theme bridge",
      "submittedBy": "agent.james",
      "status": "OPEN",
      "tipPatchsetId": "patchset:P1",
      "action": "review patchset:P1 --verdict approve|request-changes"
    }
  ],
  "frontier": [
    {
      "id": "task:DSH-001",
      "title": "Fix campaign nodes",
      "hours": 2,
      "campaignId": "campaign:DASHBOARD",
      "onCriticalPath": false,
      "blockedBy": [],
      "action": "claim task:DSH-001"
    }
  ],
  "alerts": [
    { "severity": "warning", "message": "2 orphan quests lack intent lineage" },
    { "severity": "info", "message": "37 inbox items awaiting triage" }
  ],
  "graphMeta": {
    "tick": 186,
    "writers": 5,
    "tip": "5373bfc"
  }
}
```

**Text mode** (`--format text`): Same data, rendered as a readable briefing document for human debugging:

```text
═══ AGENT BRIEFING ═══════════════════════════════════════
Project: xyph — Causal Operating System for Agent Planning
Identity: agent.claude (capabilities: claim, submit, revise, review)
Progress: 72/118 quests (61%)

── MY ASSIGNMENTS ────────────────────────────────────────
  ▶ task:BJU-002  Port render-status.ts  [IN_PROGRESS]  4h
    claimed 7 days ago, no submission yet
    → submit or continue working

── REVIEW QUEUE ──────────────────────────────────────────
  submission:S1  Theme bridge  [OPEN]  by agent.james
    → xyph review patchset:P1 --verdict approve|request-changes

── AVAILABLE WORK (frontier) ─────────────────────────────
  task:DSH-001  Fix campaign nodes  2h  campaign:DASHBOARD
    → xyph claim task:DSH-001
  task:DSH-003  Add link-intent command  2h  campaign:DASHBOARD
    → xyph claim task:DSH-003
  ... (12 more)

── ALERTS ────────────────────────────────────────────────
  ⚠ 2 orphan quests lack intent lineage
  ℹ 37 inbox items awaiting triage
══════════════════════════════════════════════════════════
```

**Markdown mode** (`--format markdown`): For agents that work in markdown-native environments (Claude Code CLAUDE.md injection, GitHub issue comments, etc.)

#### 6b. `xyph agent-status` — Quick State Check

Lighter than briefing — just current state without the decision support:

```bash
xyph agent-status [--format json|text] [--filter assigned|frontier|reviews|inbox]
```

Filters let agents request only what they need to save context window.

#### 6c. `xyph agent-next` — "What Should I Do?"

Opinionated recommendation engine. Analyzes project state and suggests the single best next action with reasoning:

```bash
xyph agent-next [--format json|text]
```

```json
{
  "recommendation": {
    "action": "submit",
    "target": "task:BJU-002",
    "reasoning": "You've had this claimed for 7 days with no submission. Either submit progress or release the claim.",
    "command": "xyph submit task:BJU-002 --description \"...\""
  },
  "alternatives": [
    {
      "action": "review",
      "target": "patchset:P1",
      "reasoning": "Open submission awaiting review, 2 days old",
      "command": "xyph review patchset:P1 --verdict approve --comment \"...\""
    }
  ]
}
```

Priority logic:

1. Stale assignments (submit or release)
2. Pending reviews (unblock others)
3. Frontier work (claim and execute)
4. Inbox triage (if nothing else)

#### 6d. `xyph agent-act` — Validated Action Execution

Wrapper around actuator commands with pre-validation and structured response:

```bash
xyph agent-act claim task:DSH-001 [--dry-run] [--format json|text]
```

```json
{
  "action": "claim",
  "target": "task:DSH-001",
  "preconditions": {
    "exists": true,
    "status": "BACKLOG",
    "claimable": true,
    "alreadyClaimed": false
  },
  "result": "success",
  "patchSha": "abc1234",
  "sideEffects": ["status → IN_PROGRESS", "assigned_to → agent.claude"],
  "nextAction": "Begin work, then: xyph submit task:DSH-001 --description \"...\""
}
```

`--dry-run` validates without executing — useful for agents that want to check before committing.

#### 6e. `xyph agent-log` — Session Activity Audit

What has this agent done recently? For self-audit and debugging:

```bash
xyph agent-log [--since 24h] [--format json|text]
```

Reads patches from the agent's writer ref and summarizes actions chronologically.

### Architecture

```text
xyph-actuator.ts (CLI)
  ├── existing commands (quest, claim, submit, review, ...)
  └── agent-* commands (NEW)
        ├── AgentBriefingService  — assembles briefing from snapshot + graph
        ├── AgentRecommender      — priority logic for agent-next
        └── AgentActionValidator  — precondition checks for agent-act

Format layer:
  ├── JsonFormatter   — structured JSON (default)
  ├── TextFormatter   — human-readable debug output
  └── MarkdownFormatter — for context injection
```

All agent commands use the same `GraphContext.fetchSnapshot()` as the TUI — same data, different presentation. The recommender and validator are new domain services.

### Relationship to MCP Server (task:mcp-server)

The agent CLI commands are the **immediate** solution — any agent with shell access can use them. The MCP server (future) would expose the same services over the Model Context Protocol for agents that support MCP natively. The domain services (briefing, recommender, validator) are shared between both interfaces.

### Files

| File | Purpose |
|------|---------|
| `src/domain/services/AgentBriefingService.ts` | Assemble briefing from snapshot |
| `src/domain/services/AgentRecommender.ts` | Priority logic for next action |
| `src/domain/services/AgentActionValidator.ts` | Precondition checks |
| `src/ports/AgentPort.ts` | Port interface for agent services |
| `src/infrastructure/adapters/WarpAgentAdapter.ts` | Graph-backed implementation |
| `xyph-actuator.ts` | New `agent-*` subcommands |
| `src/formatters/JsonFormatter.ts` | JSON output |
| `src/formatters/TextFormatter.ts` | Human-readable text |
| `src/formatters/MarkdownFormatter.ts` | Markdown for context injection |

#### 6f. Agent Participation — Ideas, Bugs, and Collaboration

Agents are equal participants. They need to contribute ideas, report bugs, and collaborate — not just execute assigned work.

**Enhanced `inbox` command:**

```bash
xyph inbox task:BUG-001 \
  --title "GraphContext.fetchSnapshot crashes on empty graph" \
  --suggested-by agent.claude \
  --description "Stack trace: ... Reproduction: fresh repo with no patches." \
  --labels bug,graph
```

Add `--description` and `--labels` to the inbox command. The description is stored as a graph property — same mechanism as intent descriptions.

**`xyph comment <id> --message "..."` command:**

Add comments to any entity (quest, submission, intent). Stored as a new `comment:` node type with edges. Agents can add context, flag concerns, or explain their reasoning without formal review.

**`xyph flag <id> --reason "..."` command:**

Mark an entity as needing human attention. Creates a `flag:` node visible in the dashboard alert bar. Agents can self-report uncertainty: "I claimed this but I'm stuck — human review requested."

#### 6g. Agent Submission & Review Workflow

Agents need first-class access to the full submission lifecycle — not just executing commands, but understanding context, providing structured reviews, and participating in discussion.

**`xyph agent-submissions` — Structured submission view:**

```bash
xyph agent-submissions [--filter mine|reviewable|all] [--format json|text]
```

```json
{
  "reviewable": [
    {
      "id": "submission:S1",
      "questId": "task:BJU-002",
      "questTitle": "Port render-status.ts to bijou components",
      "submittedBy": "agent.james",
      "status": "OPEN",
      "submittedAt": "2026-02-25T...",
      "tipPatchsetId": "patchset:P3",
      "patchsetCount": 3,
      "reviews": [
        { "verdict": "request-changes", "by": "human.james", "comment": "Needs tests" }
      ],
      "availableActions": ["review", "comment"]
    }
  ],
  "mine": [
    {
      "id": "submission:S2",
      "questId": "task:DSH-001",
      "status": "CHANGES_REQUESTED",
      "reviews": [
        { "verdict": "request-changes", "by": "human.james", "comment": "Missing error handling" }
      ],
      "availableActions": ["revise", "comment"],
      "guidance": "Address review feedback, then: xyph revise submission:S2 --description '...'"
    }
  ]
}
```

**`xyph agent-review <patchset-id>` — Structured review with context:**

```bash
xyph agent-review patchset:P3 --verdict approve --comment "LGTM" [--format json]
```

Pre-validates:

- Patchset exists and belongs to an OPEN/CHANGES_REQUESTED submission
- Reviewer is not the submitter (can't self-approve)
- Shows what changed since last review if this is a re-review

Response includes the review's effect on submission status (e.g., "submission now has 1 approval, needs 0 more for merge eligibility").

**`xyph agent-submit <quest-id>` — Submit with structured metadata:**

```bash
xyph agent-submit task:DSH-001 \
  --description "Fixed campaign node type resolution" \
  --test-results "434/434 pass" \
  --files-changed 3 \
  [--format json]
```

Structured response confirms submission created, shows next steps ("awaiting review from human.james or another agent").

**Submission comments:**

Agents should be able to discuss submissions — ask questions about review feedback, explain design decisions, request clarification:

```bash
xyph comment submission:S1 --message "Re: missing error handling — the adapter already validates at the port boundary, adding another check here would be redundant. See WarpSubmissionAdapter.ts:52." --by agent.claude
```

This uses the same `comment` command from 6f but scoped to submissions. Comments are visible in both the human TUI (submissions detail panel) and the agent briefing.

**Participation in the agent briefing:**

The `agent-briefing` output should include a "contribution opportunities" section:

- Inbox items this agent suggested (track their impact)
- Comments/flags this agent has filed
- Suggestions for what to inbox based on patterns the agent notices

### Verification

```bash
npx tsc --noEmit
npm run test:local
npx tsx xyph-actuator.ts agent-briefing --format json | jq .
npx tsx xyph-actuator.ts agent-briefing --format text
npx tsx xyph-actuator.ts agent-next --format text
npx tsx xyph-actuator.ts agent-act claim task:DSH-001 --dry-run --format json
npx tsx xyph-actuator.ts comment task:DSH-001 --message "This is blocked by..." --by agent.claude
npx tsx xyph-actuator.ts flag task:BJU-002 --reason "Stuck for 7 days, need guidance" --by agent.claude
```

---

## Phase 7: Triage Engine — Reviewed Promotions & Inbox Intelligence

### Problem

Today, promotion is a single-actor instant operation: one person runs `xyph promote` and the quest immediately joins the backlog. But promotion is consequential — it adds scope to the project, allocates intent lineage, and assigns campaign membership. If submissions require review before merging code, why don't promotions require review before adding work?

Meanwhile, the inbox grows unchecked. There's no guidance on which items belong in which campaigns, no priority signal, and no way for multiple stakeholders to weigh in on what gets promoted.

### Design

#### 7a. Promotion Review Workflow

Model promotions like submissions — a multi-step reviewed process:

**Current flow:**

```text
INBOX → promote(intentId) → BACKLOG (instant, single actor)
```

**New flow:**

```text
INBOX → propose(intentId, campaignId, rationale)
      → PROPOSED (new status)
      → reviewers approve/reject the proposal
      → when policy met: → BACKLOG (with full lineage)
```

**New graph nodes:**

- `proposal:` node type — like `submission:` but for promotions
- Links: `proposal:P1 --proposes--> task:I-001`
- Links: `proposal:P1 --targets-intent--> intent:DASHBOARD`
- Links: `proposal:P1 --targets-campaign--> campaign:DASHBOARD`
- Reviews on proposals: same `review:` node type, linked via `--reviews--> proposal:P1`

**New quest status:** `PROPOSED` — between INBOX and BACKLOG. Visible in both triage view and inbox view. Quest stays in PROPOSED until promotion is approved.

**CLI commands:**

```bash
# Propose promotion (replaces instant promote for reviewed mode)
xyph propose task:I-001 \
  --intent intent:DASHBOARD \
  --campaign campaign:DASHBOARD \
  --rationale "Fits the dashboard roadmap, unblocks BJU-004" \
  --hours 3

# Review a proposal
xyph review-proposal proposal:P1 --verdict approve --comment "Agreed, good fit"
xyph review-proposal proposal:P1 --verdict reject --comment "Too broad, split first"

# Auto-promote when policy is satisfied (or manual override by human)
xyph accept-proposal proposal:P1
```

**Policy configuration:**

Stored in the WARP graph on a `config:triage-policy` node:

```json
{
  "promotionApprovals": 1,
  "autoPromoteOnApproval": true,
  "requireHumanApproval": true,
  "allowAgentProposals": true,
  "allowAgentApprovals": false
}
```

- `promotionApprovals: 0` — instant promote (current behavior, solo mode)
- `promotionApprovals: 1` — one approval needed (default for teams)
- `promotionApprovals: 2` — two approvals (high-rigor projects)
- `requireHumanApproval` — at least one approver must be `human.*`
- `allowAgentProposals` — agents can propose promotions
- `allowAgentApprovals` — agents can approve promotions (or only humans)
- `autoPromoteOnApproval` — auto-transition PROPOSED → BACKLOG when policy met

When `promotionApprovals: 0`, the existing `xyph promote` command works as-is (backwards compatible). When > 0, `promote` becomes `propose` under the hood.

#### 7b. Triage View (TUI)

New dedicated view — or enhanced inbox — for triaging work. Shows:

**Left panel — Triage queue:**

Three sections:

1. **Pending proposals** — PROPOSED items awaiting approval (most urgent)
2. **Inbox items** — raw INBOX items awaiting triage
3. **Recently decided** — last N items promoted/rejected (context)

**Right panel — Item detail + recommendations:**

For the selected item:

- Full title, description, suggested-by, age in inbox
- AI-generated recommendations (see 7c)
- Available actions: propose, reject, approve proposal
- Review history if PROPOSED

**Keybindings:**

| Key | Action |
|-----|--------|
| `j/k` | Navigate items |
| `p` | Propose promotion (opens intent/campaign/rationale input) |
| `a` | Approve pending proposal |
| `x` | Reject (with rationale input) |
| `Enter` | Expand detail |

#### 7c. Triage Recommendation Engine

Generate structured recommendations for each inbox item to accelerate triage:

**Campaign suggestion:**

Analyze item title against existing campaign titles and quest titles. Suggest the best-fit campaign with confidence:

```text
Suggested campaign: campaign:DASHBOARD (high confidence)
  Reason: 5 similar quests already in this campaign
```

**Intent suggestion:**

Match against existing intents:

```text
Suggested intent: intent:DASHBOARD (medium confidence)
  Reason: Title mentions "TUI" which aligns with dashboard intent
```

**Priority signal:**

- Is this a blocker for other work? (dependency analysis)
- How long has it been in inbox? (staleness)
- Who suggested it? (agent suggestions might need more scrutiny)
- Is it a duplicate of existing work? (title similarity check)

**Implementation approach:**

Start with heuristic matching (string similarity, keyword overlap with campaign/intent titles). This doesn't need AI — simple TF-IDF or even substring matching gets you 80% of the way. Future: integrate with agent briefing to provide AI-powered recommendations.

**CLI output:**

```bash
xyph triage-report [--format json|text|markdown]
```

```text
═══ TRIAGE REPORT ═══════════════════════════════════════
37 items in INBOX · oldest: 12 days · 3 proposals pending

── PENDING PROPOSALS (need your approval) ────────────────
  proposal:P1  task:OVR-001  → campaign:DASHBOARD
    proposed by agent.claude · 1 approval needed
    rationale: "Fits the dashboard roadmap"

── RECOMMENDATIONS ───────────────────────────────────────
  HIGH CONFIDENCE (auto-assignable):
    task:OVR-002  "In-progress + pending review"
      → campaign:DASHBOARD · intent:DASHBOARD
    task:LIN-001  "Surface intent description"
      → campaign:DASHBOARD · intent:DASHBOARD

  NEEDS REVIEW:
    task:AGT-001  "Agent briefing command"
      → new campaign? or campaign:CLITOOL?
      No clear intent match — may need new intent

  POSSIBLE DUPLICATES:
    task:OVR-012 "Rename overview to dashboard"
      ~ similar to task:OVR-005 "Change default view"
      Consider merging

  STALE (>7 days, no activity):
    task:snapshot-render-tests · 12 days
    task:vi-stub-env-migration · 10 days
══════════════════════════════════════════════════════════
```

#### 7d. Triage in Agent Briefing

Add a triage section to `agent-briefing`:

```json
{
  "triageQueue": {
    "pendingProposals": 3,
    "inboxCount": 37,
    "oldestDays": 12,
    "recommendations": [
      {
        "id": "task:OVR-002",
        "suggestedCampaign": "campaign:DASHBOARD",
        "suggestedIntent": "intent:DASHBOARD",
        "confidence": "high",
        "action": "xyph propose task:OVR-002 --intent intent:DASHBOARD --campaign campaign:DASHBOARD --rationale '...'"
      }
    ]
  }
}
```

Agents can then act on these recommendations through `agent-act` or direct CLI commands.

### Files

| File | Purpose |
|------|---------|
| `src/domain/entities/Proposal.ts` | Proposal entity with validation |
| `src/domain/models/dashboard.ts` | ProposalNode type, PROPOSED status |
| `src/domain/services/TriageRecommender.ts` | Heuristic campaign/intent matching |
| `src/ports/TriagePort.ts` | Port for propose/approve/reject |
| `src/infrastructure/adapters/WarpTriageAdapter.ts` | Graph-backed implementation |
| `src/tui/bijou/views/triage-view.ts` | TUI triage view |
| `src/tui/bijou/DashboardApp.ts` | New view, keybindings, TriageState |
| `xyph-actuator.ts` | propose, review-proposal, accept-proposal, triage-report commands |

### Verification

```bash
npx tsc --noEmit
npm run test:local
npx tsx xyph-actuator.ts triage-report --format text
npx tsx xyph-actuator.ts propose task:OVR-001 --intent intent:DASHBOARD --campaign campaign:DASHBOARD --rationale "test"
npx tsx xyph-actuator.ts review-proposal proposal:P1 --verdict approve --comment "LGTM"
./xyph-dashboard.ts   # Tab to triage view
```

---

## Phase 8: Graveyard View

### Problem

Rejected quests disappear. The graveyard fold on the dashboard shows a count, but there's no way to inspect *why* things were rejected, spot patterns (are we rejecting the same kind of work repeatedly?), or resurrect items that deserve a second look. The graveyard is an audit trail — it should be browsable.

### Design

New view in the tab bar: `dashboard → roadmap → submissions → lineage → triage → graveyard → inbox`

#### 8a. Layout

```text
  ── Graveyard (3 quests) ──────────────────────────────────────────────────────

  ▶ task:I-042  "Add WebSocket live updates"
    rejected by human.james · 2026-02-15
    rationale: "Out of scope — XYPH is offline-first, no server dependency"
    suggested by agent.claude · was in INBOX 4 days

    task:I-019  "Redis caching layer for graph queries"
    rejected by human.james · 2026-02-10
    rationale: "Premature optimization — graph materializes in <50ms"
    suggested by agent.claude · was in INBOX 2 days

    task:BX-099  "Auto-merge submissions without review"
    rejected by human.james · 2026-01-28
    rationale: "Violates Constitution Art. IV — human sovereignty non-negotiable"
    suggested by agent.james · was in INBOX 1 day
```

Each entry shows:

- Quest ID + title
- Who rejected it and when
- Rejection rationale (full text, not truncated)
- Who originally suggested it
- How long it sat in inbox before rejection (derived from `suggestedAt` → `rejectedAt`)

#### 8b. Selection + Actions

| Key | Action |
|-----|--------|
| `j/k` | Navigate items |
| `Enter` | Expand/collapse full detail |
| `r` | Reopen selected quest (sends back to INBOX via `IntakePort.reopen()`) |

Reopening a quest is the "second chance" mechanism. The quest returns to INBOX with its rejection history preserved — the audit trail is never erased.

#### 8c. Patterns section

At the top of the view, show aggregate insights:

- Total graveyard count
- Top rejector (who rejects the most?)
- Top suggester whose items get rejected (is one agent suggesting bad work?)
- Common rejection reasons (keyword frequency if we have enough data)

#### 8d. Model changes

```typescript
interface GraveyardState {
  selectedIndex: number;
  expandedId: string | null;
}
```

Add to `DashboardModel`. Add `'graveyard'` to `ViewName`. Wire keybindings.

### Files

| File | Changes |
|------|---------|
| `src/tui/bijou/views/graveyard-view.ts` | New view |
| `src/tui/bijou/DashboardApp.ts` | GraveyardState, ViewName, keybindings, reopen action |
| `src/tui/bijou/__tests__/views.test.ts` | Graveyard view tests |

### Verification

```bash
npx tsc --noEmit
npm run test:local
./xyph-dashboard.ts   # Tab to graveyard view
```

Manual checks:

- Shows all GRAVEYARD quests with full rejection rationale
- j/k navigates, Enter expands detail
- `r` reopens quest (returns to INBOX, toast confirms)
- Patterns section shows aggregate stats

---

## Phase 9: Vocabulary Rename — INBOX→BACKLOG, BACKLOG→PLANNED

### Rationale

The current terms don't match how they feel:

- **"Inbox"** feels personal ("my tasks") — but it's really a communal suggestion pool
- **"Backlog"** feels vague ("unplanned stuff") — but these items are promoted, have intent lineage, and are authorized work

Better vocabulary:

- **Backlog** = ideas, suggestions, proposals awaiting triage. "Should we do this?"
- **Planned** = officially on the roadmap, in the DAG with dependencies vetted. "We're doing this."

The promotion ceremony gains weight: you're not flipping a status label, you're **inserting work into the project DAG**. That means identifying dependencies (Weaver), assigning a campaign, linking intent (sovereignty), and estimating hours. The DAG is the project plan. Joining the DAG means you're planned.

### Status Lifecycle (new)

```text
BACKLOG → propose/promote → PLANNED → claim → IN_PROGRESS → submit/seal → DONE
                                  ↘ BLOCKED (by dependencies)
            reject ↘
                GRAVEYARD → reopen → BACKLOG
```

### Collapsing BACKLOG + PLANNED

The current codebase has both `BACKLOG` and `PLANNED` as separate statuses. The distinction ("promoted but unscheduled" vs "scheduled") isn't meaningful — if work has intent lineage and campaign membership, it's planned. Collapse them:

| Old Status | New Status | Meaning |
|------------|-----------|---------|
| `INBOX` | `BACKLOG` | Suggestions awaiting triage |
| `BACKLOG` | `PLANNED` | On the roadmap, in the DAG |
| `PLANNED` | `PLANNED` | Merged with old BACKLOG |
| `IN_PROGRESS` | `IN_PROGRESS` | (unchanged) |
| `BLOCKED` | `BLOCKED` | (unchanged) |
| `DONE` | `DONE` | (unchanged) |
| `GRAVEYARD` | `GRAVEYARD` | (unchanged) |

### Promotion = DAG Insertion

When a quest is promoted from BACKLOG → PLANNED, the promotion process should:

1. **Link intent** (required) — sovereignty lineage
2. **Assign campaign** (required) — which milestone does this belong to?
3. **Identify dependencies** — what must be done first? (`depend` edges)
4. **Estimate hours** — how much work is this?
5. **Validate DAG** — does inserting this create cycles? Is it reachable from the campaign root?

This is the triage engine's job (Phase 7). The `propose` command captures all of this. The review process validates it. Acceptance inserts the quest into the DAG.

### Scope of Change

This is a codebase-wide rename touching:

**Domain layer:**

- `QuestStatus` enum in `Quest.ts` — rename values
- `IntakePort` / `IntakeService` — `promote()` becomes `plan()` or stays but terminology in docs changes
- `SovereigntyService` — audit checks reference BACKLOG (becomes PLANNED)

**Infrastructure:**

- `GraphContext.fetchSnapshot()` — status string mapping
- `WarpIntakeAdapter` — writes `status: 'BACKLOG'` (becomes `'PLANNED'`)
- Existing graph data — **migration needed** for existing `INBOX` → `BACKLOG` and `BACKLOG`/`PLANNED` → `PLANNED` nodes

**TUI:**

- Tab labels: "inbox" tab → "backlog" tab
- `ViewName` type: `'inbox'` → `'backlog'`
- `inboxView` → `backlogView` (file rename)
- All status display strings
- `styledStatus()` mapping

**CLI:**

- `xyph-actuator.ts` — `inbox` command becomes `backlog`, help text updates
- All command descriptions referencing "inbox" or "backlog"

**Tests:**

- Every test asserting on `'INBOX'` or `'BACKLOG'` status strings

**Documentation:**

- CLAUDE.md command reference
- CONSTITUTION.md if it references status names
- docs/TUI-plan.md (this file)

### Migration Strategy

1. Add new status values alongside old ones (dual-write period)
2. Graph migration patch: bulk-rename `status` properties on all existing nodes
3. Remove old status values
4. Or: accept that old graph data has old names and normalize at read time in `fetchSnapshot()`

Option 4 (normalize at read time) is lowest risk — a mapping layer in `GraphContext` translates `INBOX→BACKLOG` and `BACKLOG→PLANNED` / `PLANNED→PLANNED` when reading. Old data works forever, new writes use new terms.

### Files

| File | Changes |
|------|---------|
| `src/domain/entities/Quest.ts` | `QuestStatus` enum rename |
| `src/domain/services/*.ts` | Status references |
| `src/ports/IntakePort.ts` | Method signatures / docs |
| `src/infrastructure/GraphContext.ts` | Status normalization layer |
| `src/infrastructure/adapters/WarpIntakeAdapter.ts` | New status values |
| `src/tui/bijou/DashboardApp.ts` | ViewName, hints, keybindings |
| `src/tui/bijou/views/backlog-view.ts` | Renamed from inbox-view.ts |
| `src/tui/theme/xyph-presets.ts` | Status color mappings |
| `xyph-actuator.ts` | Command names, help text |
| `CLAUDE.md` | Command reference |
| All test files | Status string assertions |

### Verification

```bash
npx tsc --noEmit
npm run test:local
npx tsx xyph-actuator.ts status --view roadmap   # Should show PLANNED not BACKLOG
npx tsx xyph-actuator.ts status --view inbox      # Should show "backlog" terminology
./xyph-dashboard.ts                               # Tab labels updated
```
