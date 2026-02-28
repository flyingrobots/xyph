# XYPH CLI & Agent Interface — Enhancement Plan

## Context

The CLI (`xyph-actuator.ts`) is the primary interface for both humans and agents. Bijou v0.6.0 introduced interactive primitives (`wizard()`, `filter()`, `textarea()`) that can transform multi-flag commands into guided flows. Meanwhile, the agent interface is underserved — agents need structured I/O, session lifecycle commands, and batch operations to work efficiently.

This plan covers three tracks:
1. **Interactive CLI** — bijou-powered wizard flows for humans
2. **Missing Commands** — gaps in the current CLI surface
3. **Agent Protocol** — structured interface for AI agent participants

---

## Track 1: Interactive CLI (bijou v0.6.0)

### Principle

Every multi-flag command should have an interactive mode. When called without flags, launch a `wizard()`. When called with all flags, run headless. This means zero breaking changes — the interactive mode is additive.

### 1a. `xyph quest` (interactive mode)

**Current:** `npx tsx xyph-actuator.ts quest task:FOO-001 --title "..." --campaign campaign:X --intent intent:Y`

**Interactive flow:**
```
Step 1: filter() → pick campaign (fuzzy search over existing campaigns)
Step 2: input()  → quest ID (auto-suggest next ID in campaign sequence)
Step 3: input()  → title
Step 4: input()  → estimated hours (optional, skip if empty)
Step 5: filter() → dependencies (multi-select from existing tasks, skip if none)
Step 6: confirm() → review summary, create quest
```

**`wizard()` conditional skip:** If only one campaign exists, skip step 1. If no tasks exist yet, skip step 5.

### 1b. `xyph review` (interactive mode)

**Current:** `npx tsx xyph-actuator.ts review <patchset-id> --verdict approve --comment "..."`

**Interactive flow:**
```
Step 1: filter()   → pick from open submissions (show quest title + status)
Step 2: (display)  → show patchset summary / diff stats
Step 3: select()   → verdict: approve | request-changes | comment
Step 4: textarea() → review comment (rich multi-line)
Step 5: confirm()  → submit review
```

### 1c. `xyph promote` (interactive mode)

**Current:** `npx tsx xyph-actuator.ts promote <id> --intent intent:X`

**Interactive flow:**
```
Step 1: filter()  → pick inbox item (fuzzy search, show title + suggester)
Step 2: filter()  → pick authorizing intent
Step 3: filter()  → pick target campaign (or create new)
Step 4: confirm() → promote
```

### 1d. `xyph triage` (session mode)

**New command.** Not a single-shot operation — a loop that processes inbox items one by one.

```
Loop:
  Show next inbox item (title, suggester, date, any previous rejection)
  select() → action: promote | reject | defer
  If promote:
    filter() → pick campaign
    filter() → pick intent
  If reject:
    textarea() → rationale
  If defer:
    skip (stays in inbox)
  Repeat until inbox empty or user quits (q)

End: Show summary — N promoted, M rejected, K deferred
```

**Why wizard():** Each iteration is a mini-wizard with conditional branching. The `skip` function handles the promote/reject/defer routing.

---

## Track 2: Missing CLI Commands

### 2a. `xyph show <id>`

**The most glaring gap.** There's no way to inspect a single entity without scanning `status --view all`.

```
$ xyph show task:WVR-003

  task:WVR-003 — Frontier computation — ready set of tasks
  ─────────────────────────────────────────────────────────
  Status:     DONE
  Campaign:   campaign:WEAVER (Milestone 7: Weaver)
  Intent:     intent:WEAVER
  Assigned:   —
  Hours:      4
  Sealed:     2026-02-28 (artifact:task:WVR-003)

  Dependencies:
    → task:WVR-001 (DONE)  depends-on / blocked-by edge types
    → task:WVR-002 (DONE)  DAG cycle detection at ingest

  Submissions: (none)

  Provenance:
    Created by agent.james at tick 29
    Sealed by agent.prime at tick 156
```

With `--json`: returns structured object. This is the foundation for agent context queries.

### 2b. `xyph assign <quest> <principal>`

Currently agents `claim` tasks (self-assign), but there's no directed assignment. A human should be able to say "agent.prime, work on this."

```
$ xyph assign task:DSH-008 agent.prime
[OK] task:DSH-008 assigned to agent.prime.
```

Sets `assigned-to` property on the quest node. Complements `claim` (self-assignment) with `assign` (directed assignment).

### 2c. `xyph move <quest> --campaign <id>`

Reassign a quest to a different campaign. Useful when triage reveals miscategorization.

```
$ xyph move task:TRG-004 --campaign campaign:TRIAGE
[OK] task:TRG-004 moved to campaign:TRIAGE.
```

Updates the `belongs-to` edge.

### 2d. `xyph plan <campaign>`

Campaign execution plan. All the data exists via DepAnalysis + graph queries — this just surfaces it per-campaign.

```
$ xyph plan campaign:DASHBOARD

  campaign:DASHBOARD — Milestone 5: WARP Dashboard
  Progress: 14/22 DONE (64%)

  Frontier (ready now):
    task:BJU-009  Wire graph.watch() into TEA loop         2h
    task:DSH-001  Fix campaign nodes: type stored as task   2h

  Blocked:
    task:BJU-010  Remove React/Ink deps                    2h  (blocked by BJU-009)

  Critical Path: BJU-009 → BJU-010 (4h remaining)
```

### 2e. `xyph diff [--since <tick|duration>]`

Graph diff — what changed since a point in time. Not submission diff, but *roadmap-level* change detection.

```
$ xyph diff --since 24h

  Changes in last 24 hours (ticks 140–156):

  Sealed:
    + task:WVR-001  depends-on edge types           (agent.prime)
    + task:WVR-005  Critical path calculation        (agent.prime)
    + task:BJU-004  Port RoadmapView                 (agent.prime)

  Status changes:
    ~ task:BJU-002  PLANNED → IN_PROGRESS            (agent.prime)

  New items:
    + task:tui-toast-watch      (inbox, agent.prime)
    + task:cli-fuzzy-claim      (inbox, agent.prime)
```

Uses `graph.temporal.*` and patch provenance to reconstruct the timeline.

---

## Track 3: Agent Protocol

### Philosophy

The agent doesn't need a *different* CLI — it needs the *same* CLI with structured I/O. `wizard()` makes the human experience better, `--json` makes the agent experience better, and the underlying graph operations are identical.

**One protocol, two interfaces.**

### 3a. `--json` flag (global)

Every command gains `--json` output mode. This is the single highest-leverage change for agent support.

```
$ xyph show task:WVR-003 --json
{
  "id": "task:WVR-003",
  "title": "Frontier computation — ready set of tasks",
  "status": "DONE",
  "campaign": "campaign:WEAVER",
  "intent": "intent:WEAVER",
  "hours": 4,
  "dependencies": ["task:WVR-001", "task:WVR-002"],
  "submissions": [],
  "sealed": { "artifact": "artifact:task:WVR-003", "sha": "da5eeeb" }
}
```

Already backlogged as `task:cli-api` but deserves priority — it unlocks MCP, web UI, and agent scripting simultaneously.

### 3b. `xyph briefing`

Start-of-session command. Structured summary of what an agent needs to know.

```
$ xyph briefing --json
{
  "since": { "tick": 140, "timestamp": "2026-02-27T18:00:00Z" },
  "changes": {
    "sealed": ["task:WVR-001", "task:WVR-003"],
    "statusChanges": [{ "id": "task:BJU-002", "from": "PLANNED", "to": "IN_PROGRESS" }],
    "newItems": ["task:tui-toast-watch"]
  },
  "myAssignments": [
    { "id": "task:BJU-002", "status": "IN_PROGRESS", "title": "Port render-status.ts" }
  ],
  "pendingReviews": [
    { "submission": "submission:abc123", "quest": "task:DSH-005", "status": "OPEN" }
  ],
  "frontier": [
    { "id": "task:BJU-009", "title": "Wire graph.watch()", "hours": 2 },
    { "id": "task:DSH-001", "title": "Fix campaign nodes", "hours": 2 }
  ]
}
```

**Implementation:** Combines `graph.temporal.*` (changes since last session), `computeFrontier()` (ready tasks), and query for open reviews/assignments.

### 3c. `xyph next`

Opinionated single recommendation. Returns ONE task with rationale.

```
$ xyph next --json
{
  "recommendation": "task:BJU-009",
  "title": "Wire graph.watch() into TEA loop for live refresh",
  "rationale": "On critical path for campaign:DASHBOARD. No unmet dependencies. 2h estimate. Unblocks BJU-010.",
  "criticalPathImpact": true,
  "frontier": true,
  "campaignProgress": "64% (14/22)"
}
```

**Scoring heuristic:**
1. My current IN_PROGRESS claims (finish what you started)
2. Frontier tasks on the critical path (highest impact)
3. Frontier tasks in the most-progressed campaign (momentum)
4. Pending reviews (unblock others)
5. Unclaimed frontier tasks (new work)

### 3d. `xyph context <id>`

Full context dump for a quest. Everything an agent needs to *start working*.

```
$ xyph context task:BJU-009 --json
{
  "quest": { "id": "task:BJU-009", "title": "Wire graph.watch()...", "status": "PLANNED", "hours": 2 },
  "intent": { "id": "intent:DASHBOARD", "title": "Build the WARP Dashboard..." },
  "campaign": { "id": "campaign:DASHBOARD", "title": "Milestone 5", "progress": "64%" },
  "dependencies": {
    "upstream": [{ "id": "task:BJU-003", "status": "DONE", "title": "TEA app shell" }],
    "downstream": [{ "id": "task:BJU-010", "status": "PLANNED", "title": "Remove React/Ink deps" }]
  },
  "relatedSubmissions": [],
  "siblingTasks": ["task:BJU-004", "task:BJU-005", "..."],
  "keyFiles": []
}
```

**Why this matters:** An agent can call `xyph context task:X --json`, feed the result into its prompt, and have full situational awareness before writing a single line of code.

### 3e. `xyph handoff`

End-of-session command. Summarizes what was done and writes a handoff node to the graph.

**Interactive (human):**
```
$ xyph handoff
  Session summary (auto-detected from patches):
    - Sealed 17 quests (WVR-001–005, BJU-004–008, DSH-005, DSH-007, ...)
    - Added 6 inbox items (tui-toast-watch, tui-chord-commands, ...)
    - Upgraded bijou to v0.6.0

  textarea() → Any notes for the next session?
  > "Weaver is done. CLI plan drafted. Ready to start navigableTable refactor."

  [OK] Handoff recorded at tick 158.
```

**Headless (agent with --json):**
```
$ xyph handoff --message "Completed WVR sealing and bijou upgrade" --json
{ "tick": 158, "patches": 23, "sealed": 17, "added": 6 }
```

### 3f. Batch Operations

Agents often want to operate on multiple items at once:

```
$ xyph batch claim task:A task:B task:C
$ xyph batch seal task:A task:B --artifact <sha> --rationale "..."
```

**Why:** Reduces round-trips. An agent running `xyph next` in a loop wants to claim a cluster of related frontier tasks, not issue 5 separate commands.

---

## Task Mapping

| Track | Item | Backlog ID | Depends On |
|-------|------|-----------|------------|
| 1 | Interactive `quest` wizard | `task:cli-wizard-quest` | bijou v0.6.0 |
| 1 | Interactive `review` wizard | `task:cli-wizard-review` | bijou v0.6.0 |
| 1 | Interactive `promote` wizard | `task:cli-wizard-promote` | bijou v0.6.0 |
| 1 | Interactive `triage` session | `task:cli-wizard-triage` | bijou v0.6.0 |
| 2 | `xyph show <id>` | `task:cli-show` | — |
| 2 | `xyph assign` | `task:cli-assign` | — |
| 2 | `xyph move` | `task:cli-move` | — |
| 2 | `xyph plan <campaign>` | `task:cli-plan` | DepAnalysis |
| 2 | `xyph diff` | `task:cli-diff` | temporal queries |
| 3 | `--json` global flag | `task:cli-api` | (exists) |
| 3 | `xyph briefing` | `task:agent-briefing` | `--json`, temporal |
| 3 | `xyph next` | `task:agent-next` | `--json`, DepAnalysis |
| 3 | `xyph context <id>` | `task:agent-context` | `--json` |
| 3 | `xyph handoff` | `task:agent-handoff` | `--json`, provenance |
| 3 | `xyph batch` | `task:cli-batch` | — |

---

## Implementation Order

**Phase A — Foundation (do first):**
1. `xyph show <id>` — everything else builds on entity inspection
2. `--json` global flag — unlocks agent protocol and scripting
3. `xyph plan <campaign>` — surfaces existing DepAnalysis per-campaign

**Phase B — Agent Protocol:**
4. `xyph briefing` — session start
5. `xyph next` — recommendation engine
6. `xyph context <id>` — deep context for task execution
7. `xyph handoff` — session end

**Phase C — Interactive Wizards:**
8. `xyph quest` wizard — highest-frequency human command
9. `xyph triage` session — process inbox efficiently
10. `xyph review` wizard — streamline review flow
11. `xyph promote` wizard — guided promotion

**Phase D — Utilities:**
12. `xyph assign` / `xyph move` — directed work management
13. `xyph batch` — multi-item operations
14. `xyph diff` — graph change detection
