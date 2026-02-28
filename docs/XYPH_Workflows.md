# XYPH Workflows

A practical guide to using XYPH day-to-day. Covers every workflow from planning to completion, for both humans and agents.

---

## Setup

### Identity

Every participant needs an identity. Set it via environment variable:

```bash
export XYPH_AGENT_ID=human.ada    # Humans use the human. prefix
export XYPH_AGENT_ID=agent.hal    # Agents use the agent. prefix
```

If unset, defaults to `agent.prime`. Your identity is attached to every graph mutation you make.

### Guild Seal (optional, recommended)

Generate an Ed25519 keypair so your completed work carries a cryptographic signature:

```bash
npx tsx xyph-actuator.ts generate-key
```

- Private key → `trust/<agentId>.sk` (gitignored, 0o600 permissions)
- Public key → `trust/keyring.json` (committed, shared with team)

Without a key, sealing still works — scrolls are just unsigned.

---

## Workflow 1: Planning Work

### Declare an Intent

Every piece of work must trace to a human decision. Agents cannot create intents.

```bash
export XYPH_AGENT_ID=human.ada

npx tsx xyph-actuator.ts intent intent:live-alerts \
  --title "Users need real-time notifications" \
  --requested-by human.ada \
  --description "Push notifications for status changes, new reviews, blocked tasks"
```

### Create a Quest

Quests are units of work. Every quest needs a campaign (grouping) and an intent (authorization):

```bash
npx tsx xyph-actuator.ts quest task:notif-001 \
  --title "WebSocket event bus" \
  --campaign campaign:live-alerts \
  --intent intent:live-alerts \
  --hours 8
```

Use `--campaign none` if the quest doesn't belong to a campaign yet.

### Declare Dependencies

Say "B can't start until A is done":

```bash
npx tsx xyph-actuator.ts depend task:notif-002 task:notif-001
```

XYPH rejects cycles automatically. Check the dependency graph:

```bash
npx tsx xyph-actuator.ts status --view deps
```

This shows:
- **Frontier** — tasks with all prerequisites complete (ready to start)
- **Blocked** — tasks waiting on something
- **Execution Order** — topologically sorted sequence
- **Critical Path** — longest weighted chain with total hours

---

## Workflow 2: The Inbox (Ideas & Triage)

### Suggest an Idea

Anyone (human or agent) can toss ideas into the inbox:

```bash
npx tsx xyph-actuator.ts inbox task:maybe-email-digest \
  --title "Email digest fallback for offline users" \
  --suggested-by human.ada
```

### Triage: Promote or Reject

Promote moves an idea to BACKLOG with sovereign intent:

```bash
npx tsx xyph-actuator.ts promote task:maybe-email-digest \
  --intent intent:live-alerts
```

Reject sends it to the graveyard (with rationale):

```bash
npx tsx xyph-actuator.ts reject task:maybe-email-digest \
  --rationale "Out of scope for v1, revisit after launch"
```

Reopen brings it back from the graveyard:

```bash
npx tsx xyph-actuator.ts reopen task:maybe-email-digest
```

### View the Inbox

```bash
npx tsx xyph-actuator.ts status --view inbox
```

---

## Workflow 3: Doing the Work

### Claim a Quest

Check what's available:

```bash
npx tsx xyph-actuator.ts status --view roadmap
```

Volunteer for a quest (Optimistic Claiming Protocol):

```bash
npx tsx xyph-actuator.ts claim task:notif-001
```

If two agents claim simultaneously, Last-Writer-Wins resolves it deterministically. The loser gets a clear failure message.

### Do the Work

Create a feature branch, write code, run quality gates:

```bash
git checkout -b feat/websocket-bus
# ... write code ...
npm run build && npm test
```

---

## Workflow 4: Completing Work

There are two paths to DONE: **seal** (solo) or **submit → review → merge** (collaborative).

### Path A: Direct Seal (Solo Work)

For work that doesn't need review:

```bash
npx tsx xyph-actuator.ts seal task:notif-001 \
  --artifact $(git rev-parse HEAD) \
  --rationale "WebSocket event bus with reconnection and heartbeat"
```

This creates a Scroll (signed artifact), marks the quest DONE, and attaches a Guild Seal if you have a keypair.

### Path B: Submit → Review → Merge (Collaborative)

**Step 1: Submit for review**

```bash
npx tsx xyph-actuator.ts submit task:notif-001 \
  --description "WebSocket event bus with reconnection, heartbeat, and backpressure handling"
```

This creates a submission envelope and a patchset capturing your branch state.

**Step 2: Get reviewed**

A reviewer evaluates the patchset:

```bash
export XYPH_AGENT_ID=human.ada

npx tsx xyph-actuator.ts review patchset:abc123 \
  --verdict approve \
  --comment "Clean implementation, good error handling"
```

Verdicts: `approve`, `request-changes`, `comment`.

**Step 3: Revise if needed**

If changes are requested, push a new patchset:

```bash
export XYPH_AGENT_ID=agent.hal

npx tsx xyph-actuator.ts revise submission:xyz789 \
  --description "Added backpressure handling per review feedback"
```

The new patchset supersedes the old one. Reviews on the old patchset remain in history.

**Step 4: Merge**

Once approved:

```bash
npx tsx xyph-actuator.ts merge submission:xyz789 \
  --rationale "All reviews approved, CI green"
```

Merge does three things in one step:
1. Git settlement (merges the branch)
2. Creates a decision node (merge record)
3. Auto-seals the quest (Scroll + Guild Seal + DONE)

**Closing without merging:**

```bash
npx tsx xyph-actuator.ts close submission:xyz789 \
  --rationale "Superseded by a different approach"
```

### Submission Status (Computed, Not Stored)

Submission status is derived from the graph — never manually set:

| Condition | Status |
|-----------|--------|
| Has merge decision | `MERGED` |
| Has close decision | `CLOSED` |
| Any effective `request-changes` review | `CHANGES_REQUESTED` |
| At least one `approve` review | `APPROVED` |
| Otherwise | `OPEN` |

---

## Workflow 5: Viewing the Graph

### CLI Views

```bash
npx tsx xyph-actuator.ts status --view roadmap       # Quests by campaign
npx tsx xyph-actuator.ts status --view lineage        # Intent → quest chains
npx tsx xyph-actuator.ts status --view all            # Every node in the graph
npx tsx xyph-actuator.ts status --view inbox          # Untriaged ideas
npx tsx xyph-actuator.ts status --view submissions    # Review workflow state
npx tsx xyph-actuator.ts status --view deps           # Dependencies, frontier, critical path
```

Add `--include-graveyard` to any view to see rejected items.

### Interactive TUI Dashboard

```bash
./xyph-dashboard.tsx
```

| Key | Context | Action |
|-----|---------|--------|
| `Tab` / `Shift+Tab` | Global | Cycle views |
| `j` / `k` | All views | Navigate items |
| `r` | Global | Refresh snapshot |
| `?` | Global | Help |
| `q` | Global | Quit |
| `c` | Roadmap | Claim selected quest |
| `h` / `l` | Roadmap | Scroll DAG left/right |
| `PgDn` / `PgUp` | Roadmap | Scroll DAG vertically |
| `Enter` | Submissions | Expand/collapse detail |
| `a` | Submissions | Approve tip patchset |
| `x` | Submissions | Request changes |
| `p` | Backlog | Promote selected task |
| `d` | Backlog | Reject selected task |
| `Esc` | Modal | Cancel / close |

The TUI has five tabs: **Dashboard** (project overview + campaign progress), **Roadmap** (DAG + detail panel), **Submissions** (review workflow), **Lineage** (intent genealogy), and **Backlog** (triage inbox).

---

## Workflow 6: Auditing & Governance

### Sovereignty Audit

Check that every BACKLOG quest traces to a human intent:

```bash
npx tsx xyph-actuator.ts audit-sovereignty
```

Reports violations with fix suggestions. The Constitution (Art. IV) requires every quest to have a Genealogy of Intent: quest → campaign → intent → human.

### Viewing Lineage

```bash
npx tsx xyph-actuator.ts status --view lineage
```

Shows the full tree: which human declared which intent, which quests fulfill it, and which scrolls sealed them.

---

## Workflow 7: Multi-Agent Coordination

### How Agents Coordinate

XYPH uses **stigmergy** — coordination through the shared graph, not direct messaging. Agents:

1. Read the graph to see what's available
2. Claim work optimistically
3. Do the work
4. Seal or submit results
5. Other agents see the changes on next materialize

### Conflict Resolution

- **Property conflicts**: Last-Writer-Wins by Lamport timestamp
- **Claim races**: Deterministic — whoever's patch has the higher tick wins
- **Dependency cycles**: Rejected at write time, never enter the graph

### Typical Agent Session

```bash
export XYPH_AGENT_ID=agent.hal

# 1. See what's available
npx tsx xyph-actuator.ts status --view deps    # Check frontier

# 2. Claim a frontier task
npx tsx xyph-actuator.ts claim task:notif-001

# 3. Do the work
git checkout -b feat/websocket-bus
# ... implement ...
npm run build && npm test

# 4. Submit for review
npx tsx xyph-actuator.ts submit task:notif-001 \
  --description "WebSocket event bus with reconnection and heartbeat"

# 5. Or seal directly (solo work)
npx tsx xyph-actuator.ts seal task:notif-001 \
  --artifact $(git rev-parse HEAD) \
  --rationale "WebSocket event bus implemented and tested"
```

---

## Quick Reference

### All Commands

| Command | Purpose |
|---------|---------|
| `intent <id> --title --requested-by` | Declare sovereign intent (humans only) |
| `quest <id> --title --campaign --intent` | Create a quest |
| `inbox <id> --title --suggested-by` | Suggest idea for triage |
| `promote <id> --intent` | Inbox → Backlog |
| `reject <id> --rationale` | Inbox → Graveyard |
| `reopen <id>` | Graveyard → Inbox |
| `depend <from> <to>` | Declare dependency |
| `claim <id>` | Volunteer for a quest |
| `submit <quest-id> --description` | Submit for review |
| `revise <submission-id> --description` | Push new patchset |
| `review <patchset-id> --verdict --comment` | Review a patchset |
| `merge <submission-id> --rationale` | Merge + auto-seal |
| `close <submission-id> --rationale` | Close without merge |
| `seal <id> --artifact --rationale` | Mark done (solo) |
| `generate-key` | Create Ed25519 keypair |
| `audit-sovereignty` | Check intent lineage |
| `status --view <view>` | View graph state |

### Status Lifecycle

```
INBOX ──promote──→ BACKLOG ──claim──→ IN_PROGRESS ──seal/merge──→ DONE
  │                                        │
  └──reject──→ GRAVEYARD ←────────────── BLOCKED
                  │
                  └──reopen──→ INBOX
```

### The Genealogy of Intent

Every completed artifact traces back to a human decision:

```
human.ada (requested)
  └─→ intent:live-alerts (authorized)
        └─→ task:notif-001 (fulfilled)
              └─→ artifact:task:notif-001 (sealed, Guild Seal signed)
```
