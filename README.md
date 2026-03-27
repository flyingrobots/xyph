<div align="center">
  <img src="docs/assets/title-screen.gif" alt="XYPH Title Screen" />
  <h1>XYPH [<a href="https://ipa-reader.com/?text=%CB%8Cz%C9%AAf">/ˌzɪf/</a>]</h1>
  <h3>Reificatory Engine</h3>
  <p><em>Xyph it done.</em></p>
</div>

---

## What Is XYPH?

**XYPH _xyphs_ intent into reality.**
An offline-first, decentralized, deterministic **planning compiler + collaboration engine** for humans and agents.

**No server. No database. Just Git.**
Instead of hand-orchestrating workflows, you compile intent into a living graph, execute it to completion, and settle outcomes with receipts.

### xyph (verb)

To compile intent into an executable plan, run it to completion, and settle the result into history with verifiable receipts.

### How It Works

XYPH solves the **Agentic Coordination Problem**: how do autonomous agents and humans collaborate on complex work without devolving into chaos? The answer is a **Planning Compiler** — a deterministic pipeline that transforms human intent into verified artifacts, the same way a software compiler transforms source code into executables.

| Planning Compiler | Software Compiler |
|---|---|
| Human intent, natural-language specs | Source code |
| WARP graph (intermediate representation) | AST / IR |
| Verified artifacts (code, docs, deployments) | Machine code |

Humans decide _what_ to build and _why_. Agents figure out _how_ and do the work. Nobody sends messages to coordinate; instead, everyone reads and writes to the shared graph. This pattern is called **stigmergy** — coordination through the environment itself.

Everything lives in a single [**WARP graph**](https://github.com/git-stunts/git-warp) — a multi-writer CRDT graph database stored in Git. Conflicts are resolved deterministically via **Last-Writer-Wins** using Lamport timestamps. Multiple entities can work with XYPH simultaneously, deterministically, and without fear of merge conflicts.

XYPH is offline-first, distributed, and defaults to living in your current Git repo alongside the rest of your project. It is invisible to normal Git workflows — it never interacts with any Git worktrees.

### The Digital Guild Model

XYPH uses a **Digital Guild** metaphor to structure collaboration:

- **Intents** — sovereign declarations of _why_ work should exist (humans only)
- **Campaigns** — named collections of related work (like milestones or epics)
- **Quests** — individual units of work (like tickets or tasks)
- **Submissions** — review envelopes linking a quest to patchsets, reviews, and a terminal decision
- **Scrolls** — content-addressed artifacts produced when a quest is sealed
- **Guild Seals** — Ed25519 cryptographic signatures proving who did the work
- **Genealogy of Intent** — the chain from scroll → quest → campaign → intent → human, ensuring every artifact traces back to a human decision

---

## Getting Started

**Prerequisites:** Node.js v22+, Git

```bash
npm install
```

### Identity

Every participant has an identity. Humans use the `human.` prefix; agents use `agent.`:

```bash
# Set for the session
export XYPH_AGENT_ID=human.ada

# Or persist it
npx tsx xyph-actuator.ts login human.ada
```

If no identity is set, it defaults to `agent.prime`.

### Graph Selection

XYPH resolves its runtime graph at bootstrap:

- local `.xyph.json` → user config `~/.xyph/config` → defaults (current repo + graph name `xyph`)

If the target repo has multiple git-warp graphs, XYPH fails loudly until you set `graph.name` explicitly. It will not guess.

Verify everything is working:

```bash
npx tsx xyph-actuator.ts status --view roadmap
```

---

## Walkthrough: Building a Feature Together

Ada is a human. Hal is an agent. They're going to build a feature together.

![Development workflow sequence](docs/diagrams/dev-workflow.svg)

### 1. Ada Declares an Intent

Every piece of work must trace back to a human decision. Ada starts by declaring an **Intent**:

```bash
export XYPH_AGENT_ID=human.ada

npx tsx xyph-actuator.ts intent intent:live-alerts \
  --title "Users need real-time notifications" \
  --requested-by human.ada
```

### 2. Ada Plans the Work

She groups work under a **Campaign** and creates **Quests** authorized by her intent:

```bash
npx tsx xyph-actuator.ts quest task:notif-001 \
  --title "WebSocket event bus" \
  --campaign campaign:live-alerts \
  --intent intent:live-alerts

npx tsx xyph-actuator.ts quest task:notif-002 \
  --title "Toast notification UI" \
  --campaign campaign:live-alerts \
  --intent intent:live-alerts
```

She can declare dependencies ("this can't start until that's done"):

```bash
npx tsx xyph-actuator.ts depend task:notif-002 task:notif-001
```

She can toss rough ideas into the **Inbox** for triage later:

```bash
npx tsx xyph-actuator.ts inbox task:notif-003 \
  --title "Maybe: email digest fallback?" \
  --suggested-by human.ada
```

And later promote or reject them:

```bash
npx tsx xyph-actuator.ts promote task:notif-003 --intent intent:live-alerts
npx tsx xyph-actuator.ts reject task:notif-003 --rationale "Out of scope for v1"
```

### 3. Hal Sets Up

Hal generates a cryptographic keypair (one-time setup). His completed work will carry a verifiable **Guild Seal**:

```bash
export XYPH_AGENT_ID=agent.hal

npx tsx xyph-actuator.ts generate-key
```

This creates an Ed25519 private key in `~/.xyph/trust/` and registers the public key in the keyring. See [Guild Seals](docs/GUILD_SEALS.md) for the full deep-dive.

### 4. Hal Claims a Quest

Hal checks the roadmap and volunteers using the **Optimistic Claiming Protocol** — CRDT convergence resolves conflicts, no locks needed:

```bash
npx tsx xyph-actuator.ts status --view roadmap
npx tsx xyph-actuator.ts claim task:notif-001
```

### 5. Hal Submits for Review

After doing the work, Hal submits. This creates a submission envelope and a patchset:

```bash
npx tsx xyph-actuator.ts submit task:notif-001 \
  --description "WebSocket event bus with reconnection and heartbeat"
```

### 6. Ada Reviews

Ada can approve, request changes, or comment:

```bash
export XYPH_AGENT_ID=human.ada

npx tsx xyph-actuator.ts review patchset:abc123 \
  --verdict approve \
  --comment "Clean implementation, LGTM"
```

If she requests changes, Hal can **revise** (push a new patchset that supersedes the old one):

```bash
npx tsx xyph-actuator.ts revise submission:xyz789 \
  --description "Added error handling per review feedback"
```

### 7. Ada Merges

Merge performs git settlement and auto-seals the quest with a Guild-signed Scroll:

```bash
npx tsx xyph-actuator.ts merge submission:xyz789 \
  --rationale "All reviews approved, tests passing"
```

For solo work without review, agents can **seal** directly:

```bash
npx tsx xyph-actuator.ts seal task:notif-001 \
  --artifact abc123def456 \
  --rationale "WebSocket bus implemented and tested"
```

### 8. Ada Checks the Result

```bash
npx tsx xyph-actuator.ts status --view lineage
npx tsx xyph-actuator.ts audit-sovereignty
```

The lineage view shows the complete Genealogy of Intent from scroll → quest → campaign → intent → human. The sovereignty audit verifies every quest has a valid chain.

---

## The TUI Cockpit

<p align="center">
  <img src="docs/assets/dashboard-demo.gif" alt="XYPH TUI Dashboard Demo" width="700" />
</p>

The TUI is a [bijou](https://github.com/flyingrobots/bijou)-powered interactive cockpit for navigating your XYPH graph.

```bash
XYPH_AGENT_ID=human.ada npm run tui
```

### Seven Lanes

| Lane | What it shows |
|---|---|
| **Now** | Cross-surface action queue (pending settlements, open reviews, ready quests) or recent activity feed |
| **Plan** | All quests by status progression |
| **Review** | Submissions and their review status |
| **Settlement** | Governance artifacts (comparisons, collapse proposals, attestations) |
| **Suggestions** | AI suggestions: incoming, queued, adopted, dismissed |
| **Campaigns** | Strategic containers with quest progress |
| **Graveyard** | Rejected and retired work |

Press `Enter` on any item to open its detail page — quests, submissions, suggestions, governance artifacts, and cases each have dedicated views with contextual actions (comment, claim, promote, approve, adopt, decide). Press `Esc` to return to the landing.

### Key Bindings

| Key | Action |
|---|---|
| `1`-`7` | Jump to lane |
| `j`/`k` | Select next/previous |
| `Enter` | Open item page |
| `Esc` | Return to landing |
| `v` | Toggle view mode (Now: queue/activity; Suggestions: incoming/queued/adopted/dismissed) |
| `r` | Refresh |
| `i` | Toggle inspector |
| `m` | Toggle "My Stuff" drawer |
| `t` | Quest dependency tree |
| `n` | Queue an Ask-AI job |
| `;` | Comment on current item |
| `:` / `/` | Command palette |
| `?` | Help |

---

## AI Suggestions

Agents can emit visible suggestions — either in response to an explicit ask-AI request or spontaneously. Suggestions are graph-visible advisory content, not silent mutations.

```bash
# Agent emits a suggestion
npx tsx xyph-actuator.ts suggest \
  --kind dependency \
  --title "Recommend a dependency edge" \
  --summary "task:TRACE-002 should depend on task:TRACE-001" \
  --for either \
  --target task:TRACE-002

# Human queues an explicit ask-AI job for agent pickup
npx tsx xyph-actuator.ts ask-ai \
  --title "Should we promote task:TRACE-002?" \
  --summary "Inspect and recommend" \
  --target task:TRACE-002

# Manage suggestions
npx tsx xyph-actuator.ts suggestion accept <id> --as quest
npx tsx xyph-actuator.ts suggestion dismiss <id> --rationale "Not now"
npx tsx xyph-actuator.ts suggestion accept-all --min-confidence 0.85
```

---

## Agent-Native Interface

XYPH provides two agent-facing surfaces: imperative CLI commands and a JSONL control plane.

### Agent CLI Commands

Agents use `briefing`, `next`, `context`, and `act` for structured work packets:

```bash
# Cold-start orientation
npx tsx xyph-actuator.ts briefing --json

# What should I work on next?
npx tsx xyph-actuator.ts next --json

# Deep context on a specific entity
npx tsx xyph-actuator.ts context task:notif-001 --json

# Execute a validated action
npx tsx xyph-actuator.ts act claim task:notif-001 --json

# Record a session handoff note
npx tsx xyph-actuator.ts handoff task:notif-001 --json
```

These return structured work packets with `blockingReasons`, `nextLawfulActions`, `expectedActor`, `attentionState`, and more. See [AGENT_PROTOCOL.md](docs/canonical/AGENT_PROTOCOL.md) for the full contract.

### Control Plane (`xyph api`)

For richer operations — worldline management, governance, and speculative execution — XYPH exposes a versioned JSONL control plane:

```bash
printf '%s\n' \
  '{"v":1,"id":"req-1","cmd":"observe","args":{"projection":"graph.summary"}}' \
  | node ./xyph.ts api
```

The control plane supports:

| Command | What it does |
|---|---|
| `observe` | Query the graph at different projections (summary, entity detail, conflicts, context, briefing, diagnostics) |
| `apply` | Execute mutation operations (add/remove nodes, set properties, manage edges) |
| `fork_worldline` | Create a derived worldline for speculative or multi-step work |
| `braid_worldlines` | Keep multiple worldline effects co-present without merge |
| `compare_worldlines` | Factual preview of divergence between worldlines |
| `collapse_worldline` | Governed settlement from a derived worldline into live |
| `attest` | Record governance attestations (gates for collapse execution) |
| `comment` | Append-only comments on any entity |
| `history` | Patch provenance for an entity |
| `diff` | State changes between two points |
| `explain` | Diagnostic tool for errors, authorization, and entity state |
| `query` | Governance worklist and artifact series queries |

See [Worldlines](docs/WORLDLINES.md) for the full design rationale behind derived worldlines, braiding, and governed settlement.

All commands support `--json` for structured JSONL output. Automation consumers should read stdout line by line.

---

## CLI Reference

All commands run via `npx tsx xyph-actuator.ts <command>`.

### Work Management

| Command | What it does |
|---|---|
| `intent <id> --title "..." --requested-by human.<name>` | Declare a sovereign intent |
| `quest <id> --title "..." --campaign <id> --intent <id>` | Create a quest |
| `inbox <id> --title "..." --suggested-by <principal>` | Suggest a task for triage |
| `promote <id> --intent <id>` | Promote to planned work |
| `ready <id>` | Mark quest ready for execution |
| `shape <id>` | Enrich quest metadata (description, kind, priority) |
| `reject <id> --rationale "..."` | Reject to graveyard |
| `reopen <id>` | Reopen a graveyarded task |
| `claim <id>` | Volunteer for a quest (OCP) |
| `depend <from> <to>` | Declare a dependency |
| `move <quest> --campaign <id>` | Reassign quest to a campaign |
| `authorize <quest> --intent <id>` | Wire quest to an intent |
| `link <quest> --campaign <id> --intent <id>` | Link quest to campaign and intent |

### Submission & Review

| Command | What it does |
|---|---|
| `submit <quest-id> --description "..."` | Submit for review (creates submission + patchset) |
| `revise <submission-id> --description "..."` | Push a new patchset superseding current tip |
| `review <patchset-id> --verdict <v> --comment "..."` | Review: approve, request-changes, or comment |
| `merge <submission-id> --rationale "..."` | Merge (git settlement + auto-seal) |
| `close <submission-id> --rationale "..."` | Close without merging |
| `seal <id> --artifact <hash> --rationale "..."` | Mark done directly (solo work) |

### Traceability

| Command | What it does |
|---|---|
| `story <id> --title "..."` | Create a user story |
| `requirement <id> --description "..."` | Create a requirement |
| `criterion <id> --description "..."` | Create an acceptance criterion |
| `evidence <id> --kind <kind>` | Create evidence for a criterion |
| `policy <id> --campaign <id>` | Create a Definition of Done policy |
| `govern <policy> <campaign>` | Attach a policy to a campaign |
| `decompose <from> <to>` | Declare decomposition (intent→story, story→requirement) |
| `implement <quest> <requirement>` | Link quest to requirement |
| `scan` | Auto-detect test-to-requirement links |
| `analyze` | Run heuristic analysis pipeline |

### Graph & Identity

| Command | What it does |
|---|---|
| `status --view <view>` | Show graph snapshot (roadmap, lineage, all, inbox, submissions, deps, trace, suggestions) |
| `audit-sovereignty` | Verify all quests have a Genealogy of Intent |
| `show <id>` | Inspect a graph entity |
| `history <id>` | Show provenance for a node |
| `comment <id> --on <target> --message "..."` | Attach a comment |
| `note <id> --on <target> --title "..." --body "..."` | Create a graph-native note |
| `spec <id> --on <target> --title "..." --body "..."` | Create a graph-native spec |
| `adr <id> --on <target> --title "..." --body "..."` | Create a graph-native ADR |
| `whoami` | Show resolved identity |
| `login <principal>` | Persist an identity |
| `logout` | Clear a persisted identity |
| `generate-key` | Generate an Ed25519 Guild Seal keypair |
| `config get/set/list` | Manage configuration |
| `doctor` / `doctor prescribe` | Audit graph health and generate prescriptions |

### Interactive Wizards

| Command | What it does |
|---|---|
| `quest-wizard` | Interactive quest creation |
| `review-wizard` | Interactive review |
| `promote-wizard <id>` | Interactive promote |
| `triage` | Interactive inbox triage session |

---

## Architecture

XYPH uses hexagonal architecture. Domain models remain pure, while ports and adapters handle I/O.

```
src/
├── domain/           # Pure domain models and services
│   ├── entities/     # Quest, Intent, Submission, Story, Requirement, ...
│   ├── services/     # CoordinatorService, ControlPlaneService, GuildSealService, ...
│   └── models/       # Dashboard, control plane, diagnostics DTOs
├── ports/            # 12 port interfaces (GraphPort, IntakePort, SubmissionPort, ...)
├── infrastructure/
│   └── adapters/     # git-warp adapters, config, keyring, LLM, workspace
├── tui/              # bijou-powered cockpit
│   └── bijou/        # TEA app, cockpit lanes, page views, overlays
├── cli/              # Commander-based CLI with 18 command groups
└── validation/       # Ed25519 crypto, patch-ops schema, invariant checks

# Entry points
xyph-actuator.ts      # CLI for graph mutations
xyph-dashboard.ts     # Interactive TUI
xyph.ts               # Dispatcher (routes to actuator or dashboard)
```

### Engine

XYPH is built on [**git-warp**](https://github.com/git-stunts/git-warp) — a CRDT graph database that lives inside a Git repository without touching the codebase. Every piece of graph data is a Git commit pointing to the empty tree, making it invisible to `git log`, `git diff`, and `git status`.

- **CRDT merge**: Nodes and edges use OR-Set semantics; properties use Last-Writer-Wins
- **Deterministic convergence**: All writers always compute the same final state
- **Offline-first**: Local success never depends on network

### Constitution

Every mutation obeys the [CONSTITUTION.md](docs/canonical/CONSTITUTION.md):

- **Art. I — Law of Determinism** — Same input, same output
- **Art. II — Law of DAG Integrity** — No dependency cycles
- **Art. III — Law of Provenance** — Every mutation is signed with rationale
- **Art. IV — Law of Human Sovereignty** — Every quest must trace to a human intent

---

## Milestone Spine

| # | Milestone | Status |
|---|-----------|--------|
| 1 | BEDROCK — foundations, repo, actuator | DONE |
| 2 | HEARTBEAT — coordinator daemon + ingest pipeline | DONE |
| 3 | TRIAGE — rebalancer + origin context | DONE |
| 4 | SOVEREIGNTY — cryptographic guild seals, approval gates, genealogy of intent | DONE |
| 5 | DASHBOARD — interactive TUI graph browser | DONE |
| 6 | SUBMISSION — native review workflow (submit, revise, review, merge) | DONE |
| 7 | WEAVER — task dependency graph, frontier, critical path | DONE |
| 8 | ORACLE — intent classification + policy engine | PLANNED |
| 9 | FORGE — emit + apply phases | PLANNED |
| 10 | CLI TOOLING — identity, packaging, time-travel, ergonomics | IN PROGRESS |
| 11 | TRACEABILITY — stories, requirements, acceptance criteria, evidence | IN PROGRESS |
| 12 | AGENT PROTOCOL — agent-native CLI and policy-bounded action kernel | IN PROGRESS |
| — | ECOSYSTEM — MCP server, Web UI, IDE integration | PLANNED |

This table is a high-level spine. Active status and dependencies live in the graph:

```bash
npx tsx xyph-actuator.ts status --view roadmap
npx tsx xyph-actuator.ts status --view deps
```

---

## Canonical Docs

The `docs/canonical/` directory contains the foundational specifications:

| Category | Documents |
|---|---|
| **Vision & Governance** | [VISION_NORTH_STAR](docs/canonical/VISION_NORTH_STAR.md), [CONSTITUTION](docs/canonical/CONSTITUTION.md), [CHANGE_CONTROL](docs/canonical/CHANGE_CONTROL.md) |
| **Architecture** | [ARCHITECTURE](docs/canonical/ARCHITECTURE.md), [AGENT_PROTOCOL](docs/canonical/AGENT_PROTOCOL.md), [ORCHESTRATION_SPEC](docs/canonical/ORCHESTRATION_SPEC.md), [SCHEDULING_AND_DAG](docs/canonical/SCHEDULING_AND_DAG.md), [ROADMAP_PROTOCOL](docs/canonical/ROADMAP_PROTOCOL.md) |
| **Data & Schema** | [GRAPH_SCHEMA](docs/canonical/GRAPH_SCHEMA.md), [DATA_CONTRACTS](docs/canonical/DATA_CONTRACTS.md), [PATCH_OPS_INVARIANTS](docs/canonical/PATCH_OPS_INVARIANTS.md), [APPLY_TRANSACTION_SPEC](docs/canonical/APPLY_TRANSACTION_SPEC.md) |
| **Security** | [GUILD_SEALS](docs/GUILD_SEALS.md), [SECURITY_AND_TRUST](docs/canonical/SECURITY_AND_TRUST.md), [AUDIT_AND_PROVENANCE](docs/canonical/AUDIT_AND_PROVENANCE.md) |
| **Quality** | [POLICY_ENGINE](docs/canonical/POLICY_ENGINE.md), [AGENT_CHARTER](docs/canonical/AGENT_CHARTER.md), [REVIEW_RUBRIC](docs/canonical/REVIEW_RUBRIC.md), [TEST_STRATEGY](docs/canonical/TEST_STRATEGY.md), [OPERATIONS_RUNBOOK](docs/canonical/OPERATIONS_RUNBOOK.md) |
| **Design** | [Worldlines](docs/WORLDLINES.md), [XYPH As A WARP App](docs/XYPH_AS_A_WARP_APP.md) |

---

## LICENSE

Apache 2.0 &bull; Copyright &copy; 2026 James Ross

---

<p align="center">
Built with &Omega;&sup1; by <a href="https://github.com/flyingrobots">FLYING ROBOTS</a>
</p>

```rust
.-:::::':::   .-:.     ::-.::::::.    :::.  .,-:::::/
;;;'''' ;;;    ';;.   ;;;;';;;`;;;;,  `;;;,;;-'````'
[[[,,== [[[      '[[,[[['  [[[  [[[[[. '[[[[[   [[[[[[/
`$$$"`` $$'        c$$"    $$$  $$$ "Y$c$$"$$c.    "$$
 888   o88oo,.__ ,8P"`     888  888    Y88 `Y8bo,,,o88o
 "MM,  """"YUMMMmM"        MMM  MMM     YM   `'YMUP"YMM
:::::::..       ...     :::::::.      ...   :::::::::::: .::::::.
;;;;``;;;;   .;;;;;;;.   ;;;'';;'  .;;;;;;;.;;;;;;;;'''';;;`    `
 [[[,/[[['  ,[[     \[[, [[[__[[\.,[[     \[[,   [[     '[==/[[[[,
 $$$$$$c    $$$,     $$$ $$""""Y$$$$$,     $$$   $$       '''    $
 888b "88bo,"888,_ _,88P_88o,,od8P"888,_ _,88P   88,     88b    dP
 MMMM   "W"   "YMMMMMP" ""YUMMMP"   "YMMMMMP"    MMM      "YMmMY"
```

<sub>&sup1; &Omega; (Omega) — the final convergence point of the WARP graph; symbolizes deterministic state resolution.</sub>
