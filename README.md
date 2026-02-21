```text
                                                              ██████
                                                              ██████
   ████████  ███████████████    ███████ ██████  █████████     ██████  ██████
     ██████ ███████   ██████    ██████  █████  ████   █████   █████ █████████
      █████ █████      ██████  ██████   ████ ████     ██████  ████  █  ███████
        ████████       ██████ ██████    ████ ███     ███████  ████ █   ███████
      ███████████       █████ █████     ████████    ███████   ██████   ███████
     ██████ ███████      ██████████     ██████████████████    ██████   ███████
   ████████  ███████      ████████      ██████ ██████████     ██████   ███████
                           ██████       ██████
                          ██████        ██████
                         ██████         ██████
```


# XYPH ([/ˌzɪf/](https://ipa-reader.com/?text=%CB%8Cz%C9%AAf))
**The Causal Operating System for Agentic Orchestration**

### **What** 

### **is**

###  **XYPH, actually?**

  

**XYPH is a Git-native “causal control plane” for building software with humans + agents.**

Not a ticket system. Not “agent orchestration” in the LangChain sense. It’s **a deterministic, multi-writer roadmap graph** where the _plan_ is the system of record and **every change is a mergeable, auditable mutation** stored in git (via a CRDT-backed graph database). 

  

A clean definition that actually fits:

  

> **XYPH is an offline-first planning compiler whose roadmap is a deterministic CRDT graph in git, enabling stigmergic collaboration (humans + agents) with cryptographic provenance and time-travelable project state.** 

  

What makes it distinct (the “nobody else does this” list):

- **Git is the database.** No server, no “sync service,” no central authority—just refs, commits, and deterministic convergence. 
    
- **Multi-writer by design.** Agents and humans are just writers; concurrent edits converge deterministically (CRDT semantics), which is fundamentally different from most PM tools’ lock/transaction model. 
    
- **Provenance isn’t “activity logs.”** It’s **causal history** you can slice, time-travel, diff, and audit (because every mutation is a git commit). 
    
- **Trust is cryptographic, not vibes.** The trust system is explicitly moving toward **Ed25519 identity-backed trust records and enforcement modes**, which is way beyond “who has access to the Jira project.” 
    
- **Stigmergy as the coordination primitive.** Nobody “messages” to coordinate; they coordinate through the shared environment (the graph).
    

  

If your current pitch is “part Issues, part Projects, part docs, part orchestration”… yeah — because you’re describing the _shadows on the wall_, not the monster.

---

## **Direct competitors (closest match)**

  

**Blunt truth:** _XYPH has very few true direct competitors_ because the “git-native CRDT roadmap + provenance + agents as writers” combo is rare.

  

Closest _direct-ish_ competitors are **Git-native / event-sourced workflow systems** and **structured automation/orchestration engines**—but they usually miss either the **planning UX**, the **multi-writer CRDT merge**, or the **human sovereignty + provenance model**.

  

So instead of “direct competitors,” think **neighboring species**.

---

## **Neighbor families (where buyers will compare you)**

  

### **1) Issue trackers & PM suites**

  

**GitHub Issues/Projects, Jira, Linear, Azure DevOps, YouTrack, Asana**

- Overlap: tasks, status, assignment, milestones, workflows.
    
- XYPH difference: those tools are **centralized databases with UI-first state**. XYPH is **a deterministic graph substrate** where UI/CLI are just projections, and “time travel” is native because history is first-class. 
    

  

**Positioning:** “Jira is a spreadsheet with permissions. XYPH is a causal ledger.”

  

### **2) Documentation & knowledge systems**

  

**Notion, Confluence, Obsidian, Dendron**

- Overlap: structured knowledge, linking, narrative/intent capture.
    
- XYPH difference: docs tools store **content**; XYPH stores **decisions + causality + execution receipts** (and can generate docs as a view).
    

  

**Positioning:** “Notion remembers _what you wrote_. XYPH remembers _why reality looks like this_.”

  

### **3) Workflow orchestration (data/infra/job schedulers)**

  

**Temporal, Airflow, Dagster, Prefect, Luigi, Argo**

- Overlap: DAGs, dependencies, scheduling, execution tracking.
    
- XYPH difference: those orchestrate **runtime execution of jobs**. XYPH orchestrates **work itself** (humans + agents), where “execution” includes design decisions, approvals, and provenance.
    

  

**Positioning:** “Temporal is an OS for workflows. XYPH is an OS for intention → work → proof.”

  

### **4) Agent orchestration frameworks**

  

**LangChain, LlamaIndex, AutoGen, CrewAI, Semantic Kernel**

- Overlap: coordinating agents/tools.
    
- XYPH difference: most of these are **in-process orchestration libraries** (prompt graphs). XYPH is a **shared, durable, multi-writer substrate** that agents collaborate through—even across machines, offline, asynchronously—without a coordinator.
    

  

**Positioning:** “Those orchestrate conversations. XYPH orchestrates commitments.”

  

### **5) GitOps / Infrastructure-as-Code ecosystems**

  

**Terraform + GitOps (ArgoCD/Flux), GitHub Actions**

- Overlap: “Git as source of truth,” auditability, declarative workflows.
    
- XYPH difference: GitOps manages **infrastructure state**; XYPH manages **project state + causality** as a graph, not files.
    

  

**Positioning:** “GitOps is declarative infra. XYPH is declarative intent.”

  

### **6) CRDT collaboration tech**

  

**Automerge, Yjs, CRDT-based note apps**

- Overlap: conflict-free collaboration.
    
- XYPH difference: CRDTs usually back docs; XYPH backs **a typed operational graph** with provenance, trust, and audit hooks—stored in git, not a sync server. 
    

---

## **How I’d describe XYPH in one sentence (usable on a homepage)**

  

Pick one depending on audience:

1. **For builders:**
    
    **“XYPH is a Git-native planning OS: a deterministic roadmap graph where humans set intent and agents execute—with auditable, time-travelable provenance.”** 
    
2. **For skeptics:**
    
    **“It’s Jira + agent automation, rebuilt on git commits and cryptographic identity so you can prove who changed what, when, and why.”**   
    
3. **For the “this feels new” crowd:**
    
    **“A stigmergic collaboration substrate: humans and agents coordinate by writing to a shared causal graph, not by messaging.”**
    

---

## **The “killer differentiator” you should lean into**

  

**Time travel + holographic provenance** for project state.

Most tools can tell you “current status.” XYPH can tell you **the causal story**—and eventually down to “why does this property have this value?” because the underlying storage model is literally built for provenance and audit. 

  

That’s not a feature. That’s a category.

  

If you want, I can also give you a **competitor matrix** (neighbors vs XYPH) with 5–7 axes that make XYPH obviously different in 10 seconds (the only acceptable attention span).

## What Is XYPH?

**XYPH** is a *planning compiler* where the project roadmap is a living, deterministic graph. Humans and agents collaborate by reading and writing to that graph. No server, no database, just Git. 

## How XYPH Works (Part I)

XYPH is a powerful development tool that is part GitHub Issues, part GitHub Projects, part interacative documentation library, part AI orchestration framework.

Humans decide *what* to build and *why*. Agents figure out *how* and do the work. Nobody sends messages to coordinate; instead, everyone reads and writes to the shared graph. This pattern is called **stigmergy** — coordination through the environment itself.

Everything lives in a single [**WARP graph**](https://github.com/flyingrobots/aion) (specifically, [git-warp](https://github.com/git-stunts/git-warp)) — a multi-writer CRDT graph database stored in Git. That means that multiple entities can work with XYPH simultaneously, deterministically, and without fear of merge conflicts. 

Thanks to the foundation provided by git-warp, XYPH is offline-first, distributed, decentralized, and lives in your Git repo, with the rest of your project.



Although XYPH lives in a Git repo, its invisible to normal Git workflows and tools, and never interacts with any Git worktrees. This means that XYPH is offline-first, distributed, works anywhere that Git can push or pull, and is built on top of the most widely-used, battle-hardened, distributed software on Earth: Git.

## How To Use XYPH

The rest of this README tells that story through a walkthrough. Ada is a human. Hal is an agent. They're going to build a feature together.

### Getting Started

#### Installing XYPH

**Prerequisites:** Node.js v20+, Git

```bash
npm install
```

#### Personalizing XYPH

Every participant has an identity set via the `XYPH_AGENT_ID` environment variable. Humans use the `human.` prefix; agents use `agent.`:

```bash
export XYPH_AGENT_ID=human.ada    # Ada is a human
export XYPH_AGENT_ID=agent.hal    # Hal is an agent
```

> [!todo]
> - Explain precedence for identity resolution
> - Explain whoami command

Verify everything is working:

```bash
npx tsx xyph-actuator.ts status --view roadmap
```

Now you're all set. Let's see how we might use XPHY in our everyday workflows.

### Walkthrough: Building a Feature Together

#### 1. Ada Declares an Intent

Every piece of work in XYPH must trace back to a human decision. Ada starts by declaring an **Intent** — a statement of *why* something should exist. Intents are the sovereign roots of all work; agents cannot create them.

> [!todo]
> Modernize all examples to use the new `xyph` CLI.

```bash
export XYPH_AGENT_ID=human.ada

npx tsx xyph-actuator.ts intent intent:live-alerts \
  --title "Users need real-time notifications" \
  --requested-by human.ada
```

This creates an `intent:` node in the graph. Everything built downstream will point back here.

#### 2. Ada Plans the Work

Ada groups related work under a **Campaign** — a named collection, like a milestone or epic. Inside the campaign she creates **Quests** — the individual units of work (think tickets or tasks). Each quest belongs to a campaign and is authorized by an intent:

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

The chain from quest → campaign → intent is the **Genealogy of Intent**. It's how XYPH enforces that every piece of work traces back to a human decision (Constitution Art. IV).

Ada can also toss a rough idea into the **Inbox** for triage later:

```bash
npx tsx xyph-actuator.ts inbox task:notif-003 \
  --title "Maybe: email digest fallback?" \
  --suggested-by human.ada
```

And later promote or reject it:

```bash
npx tsx xyph-actuator.ts promote task:notif-003 --intent intent:live-alerts
npx tsx xyph-actuator.ts reject task:notif-003 --rationale "Out of scope for v1"
```

#### 3. Hal Sets Up

Hal is a **Causal Agent** — an autonomous participant with its own writer identity in the graph. Before doing any work, Hal generates a cryptographic keypair (one-time setup):

```bash
export XYPH_AGENT_ID=agent.hal

npx tsx xyph-actuator.ts generate-key
```

This creates an Ed25519 private key in `trust/agent.hal.sk` (gitignored) and registers the public key. Hal's completed work will carry a verifiable **Guild Seal** — a cryptographic signature proving who did the work.

#### 4. Hal Claims a Quest

Hal checks the roadmap for available work:

```bash
npx tsx xyph-actuator.ts status --view roadmap
```

He sees `task:notif-001` in BACKLOG and volunteers for it using the **Optimistic Claiming Protocol (OCP)** — a pattern where agents claim work optimistically and the graph resolves conflicts via CRDT convergence:

```bash
npx tsx xyph-actuator.ts claim task:notif-001
```

If two agents claim the same quest simultaneously, last-writer-wins. No locks, no race conditions — just deterministic resolution.

#### 5. Hal Does the Work

Hal creates a feature branch, implements the WebSocket event bus, and passes quality gates:

```bash
npm run build && npm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full development workflow.

#### 6. Hal Seals the Quest

When the work is done, Hal **seals** the quest. This marks it DONE and produces a **Scroll** — a cryptographic artifact that records *what* was built, *who* built it, and *why* it was authorized:

```bash
npx tsx xyph-actuator.ts seal task:notif-001 \
  --artifact abc123def456 \
  --rationale "WebSocket bus implemented and tested"
```

The scroll is signed with Hal's Guild Seal and linked to the quest in the graph.

#### 7. Ada Checks the Result

Ada opens the dashboard to see the full picture:

```bash
XYPH_AGENT_ID=human.ada ./xyph-dashboard.tsx
```

She can see the campaign, its quests, who claimed them, and the sealed scrolls — all traceable back to her original intent. The lineage view (`status --view lineage`) shows the complete Genealogy of Intent from scroll → quest → campaign → intent → human.

She can also audit that every quest has a valid chain:

```bash
npx tsx xyph-actuator.ts audit-sovereignty
```

## XYPH Tools

### XYPH TUI Dashboard

XYPH has an interactive TUI that provides a visual browser for your project and its XYPH artifacts.

```bash
XYPH_AGENT_ID=human.yourname ./xyph-dashboard.tsx
```

| Key     | Action                                        |
|---------|-----------------------------------------------|
| `Tab`   | Cycle views (roadmap → lineage → all → inbox) |
| `↑↓`   | Navigate                                      |
| `Space` | Fold/unfold campaign · open quest detail      |
| `r`     | Refresh snapshot                              |
| `?`     | Help modal                                    |
| `p`     | Promote inbox task (human.* only)             |
| `x`     | Reject inbox task                             |
| `Esc`   | Close modal                                   |
| `q`     | Quit                                          |

### XYPH CLI Reference

All commands run via `npx tsx xyph-actuator.ts <command>`.

| Command                                                  | What it does                                           |
| -------------------------------------------------------- | ------------------------------------------------------ |
| `status --view <roadmap\|lineage\|all\|inbox>`           | View the graph (`--include-graveyard` to see rejected) |
| `intent <id> --title "..." --requested-by human.<name>`  | Declare a sovereign intent                             |
| `quest <id> --title "..." --campaign <id> --intent <id>` | Create a quest                                         |
| `inbox <id> --title "..." --suggested-by <principal>`    | Suggest a task for triage                              |
| `promote <id> --intent <id>`                             | Promote inbox task to backlog                          |
| `reject <id> --rationale "..."`                          | Reject to graveyard                                    |
| `reopen <id>`                                            | Reopen a rejected task                                 |
| `claim <id>`                                             | Volunteer for a quest (OCP)                            |
| `seal <id> --artifact <hash> --rationale "..."`          | Mark done; produces a guild-sealed scroll              |
| `generate-key`                                           | Generate an Ed25519 Guild Seal keypair                 |
| `audit-sovereignty`                                      | Verify all quests have a Genealogy of Intent           |

## How XYPH Works (Part II)

### Architecture

XYPH is built using hexagonal architecture patterns. Domain models remain pure, while ports and adapters act as interfaces with the outside world.

The XYPH binary, `xyph`, is a terminal command that exposes three layers of commands, and an interactive TUI dashboard. The commands that `xyph` provides fall into three access categories: **read-only**, **authorized mutations**, and **sovereign** commands.

```text
src/
├── domain/           # Pure domain models (Quest, Intent, ApprovalGate, ...)
├── ports/            # Interfaces (RoadmapPort, DashboardPort, IntakePort, ...)
├── infrastructure/
│   └── adapters/     # git-warp adapters (WarpRoadmapAdapter, WarpDashboardAdapter, ...)
└── tui/              # Ink-based interactive dashboard
    ├── Dashboard.tsx         # Root component (landing, help, tab routing)
    ├── HelpModal.tsx         # ? key help overlay
    ├── QuestDetailPanel.tsx  # Reusable quest detail panel
    ├── Scrollbar.tsx
    ├── logos/                # ASCII art logos (1–10.txt)
    └── views/
        ├── LandingView.tsx   # Startup screen with WARP stats
        ├── RoadmapView.tsx   # Campaign/quest tree with fold/unfold
        ├── LineageView.tsx   # Genealogy of Intent tree
        ├── AllNodesView.tsx  # Full graph node browser
        └── InboxView.tsx     # Triage inbox (Gmail-style)

# Root entry points
xyph-actuator.ts    # CLI for graph mutations (quest, intent, seal, ...)
xyph-dashboard.tsx  # Interactive TUI entry point
```

## Milestones

| # | Milestone | Status |
|---|-----------|--------|
| 1 | BEDROCK — foundations, repo, actuator | ✅ DONE |
| 2 | HEARTBEAT — coordinator daemon + ingest pipeline | ✅ DONE |
| 3 | TRIAGE — rebalancer + origin context | ✅ DONE |
| 4 | SOVEREIGNTY — cryptographic guild seals, approval gates, genealogy of intent | ✅ DONE |
| 4+ | POWERLEVEL™ — full orchestration pipeline refactor | ✅ DONE |
| 5 | WARP Dashboard TUI — interactive graph browser | 🚧 IN PROGRESS |
| 6 | WEAVER — DAG scheduling + dependency graph ([RFC_001](docs/canonical/RFC_001_AST_DRIVEN_INGEST.md)) | ⬜ PLANNED |
| 7 | ORACLE — intent classification + policy engine | ⬜ PLANNED |
| 8 | FORGE — emit + apply phases | ⬜ PLANNED |

## Constitution

Every mutation must obey the [CONSTITUTION.md](docs/canonical/CONSTITUTION.md). Key articles:

- **Art. II** — No cycles in the dependency graph (hard reject)
- **Art. IV** — Every quest must have a Genealogy of Intent (sovereign `intent:` root)
- **Art. IV.2** — Critical path changes require an ApprovalGate signed by a human

### Canonical Docs

The `docs/canonical/` directory contains the foundational specifications:

- [ARCHITECTURE.md](docs/canonical/ARCHITECTURE.md) — System architecture
- [GRAPH_SCHEMA.md](docs/canonical/GRAPH_SCHEMA.md) — Node and edge type definitions
- [ORCHESTRATION_SPEC.md](docs/canonical/ORCHESTRATION_SPEC.md) — Planning pipeline phases
- [SECURITY_AND_TRUST.md](docs/canonical/SECURITY_AND_TRUST.md) — Cryptographic trust model
- [VISION_NORTH_STAR.md](docs/canonical/VISION_NORTH_STAR.md) — Project vision

---

<p align="center">
Built with Ω¹ by [FLYING ROBOTS](https://github.com/flyingrobots)
</p>

<sub>¹ Ω (Omega) — the final convergence point of the WARP graph; symbolizes deterministic state resolution.</sub>
