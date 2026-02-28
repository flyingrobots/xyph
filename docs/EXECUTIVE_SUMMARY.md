# XYPH — Executive Summary

## What is XYPH?

XYPH is a **planning and coordination system** where the project plan is a living, executable graph — not a static document.

Every task, requirement, decision, and test result lives in a single data structure (a WARP graph) that is:

- **Deterministic** — given the same inputs, every participant computes the same state.
- **Decentralized** — no central server. Participants sync via Git, work offline, and converge automatically.
- **Time-travelable** — the entire history is preserved. You can rewind to any prior state, fork reality, and replay forward.
- **Cryptographically auditable** — every mutation is signed, timestamped, and traceable to its author.

## The Problem

Software teams coordinate through disconnected tools: issue trackers, PRs, CI dashboards, chat threads, docs. The *actual* state of a project — what's done, what's blocked, what's tested, what's at risk — is scattered across systems and reconstructed by humans through meetings and status updates.

AI agents make this worse. When five agents and three humans are working concurrently, "what's the current state?" becomes unanswerable without a shared, deterministic substrate.

## How XYPH Solves It

### The Graph is the Plan

Instead of documents that describe work, XYPH uses a **CRDT graph** where work items, dependencies, requirements, test results, and decisions are all nodes connected by typed edges. The plan isn't written — it's *computed* from the graph.

### Causal Agents

Every participant — human or AI — is a first-class **writer** with a cryptographic identity. Their mutations are permanent, ordered, and independently verifiable. There's no admin, no central authority. Trust is mathematical.

### Stigmergic Coordination

Participants don't message each other. They modify the graph, and others observe the changes. Like ants leaving pheromone trails — the environment *is* the communication medium. This eliminates coordination overhead and scales naturally.

### The Planning Compiler

XYPH treats a roadmap like source code:

- **Input:** Human intent, requirements, acceptance criteria.
- **Intermediate representation:** The WARP graph (tasks, dependencies, policies).
- **Output:** Verified artifacts — code, tests, deployments — with cryptographic proof of completion.

The system can compute: What's ready to work on? What's blocked? What's untested? What broke? What requirements are unmet? These aren't reports — they're graph queries with deterministic answers.

## Key Concepts

| Concept | What it is |
|---------|-----------|
| **Intent** | A human-authored statement of desire — the causal root of all work. |
| **Quest** | A unit of work. Volunteers claim quests; no one is assigned. |
| **Campaign** | A collection of related quests (like a milestone). |
| **Scroll** | A signed artifact produced by completing a quest. |
| **Guild Seal** | A cryptographic signature proving who did what and when. |
| **Submission** | A proposed change (like a PR) with patchsets, reviews, and a terminal decision. |

## What Makes XYPH Different

**From Jira/Linear/GitHub Issues:**
XYPH doesn't store status — it *computes* it. A task is "done" when the graph can prove all its acceptance criteria have passing evidence. No manual status updates, no stale tickets.

**From Git:**
Git tracks file history. XYPH tracks *project* history — decisions, requirements, test results, and their causal relationships. Git is used as a storage layer, not the coordination model.

**From CI/CD:**
Test results in XYPH aren't just pass/fail logs — they're **evidence nodes** linked to specific acceptance criteria. A failing test doesn't just turn a badge red; it traces back to which human intent is now unmet.

**From AI agent frameworks:**
Most frameworks give agents tools and hope for the best. XYPH gives agents a *shared deterministic substrate* where their work is auditable, their conflicts are automatically resolved, and their contributions are cryptographically attributed.

## Current State

XYPH is in alpha. What works today:

- WARP graph with multi-writer convergence (LWW with total ordering)
- Full task lifecycle: intent → quest → claim → submit → review → merge → seal
- Cryptographic Guild Seals (Ed25519 signing of completed work)
- TUI dashboard for browsing the roadmap
- CLI actuator for all graph mutations
- 500 tests, strict TypeScript, clean CI

What's next:

- **CLI tooling** — identity resolution, `--json` output, interactive wizards, `xyph show/plan/diff`
- **Agent protocol** — structured session commands: `xyph briefing`, `xyph next`, `xyph context`, `xyph handoff`
- **Requirements traceability** — stories, requirements, acceptance criteria, and evidence as graph nodes
- **MCP server** — AI agents as native graph participants

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Experience Layer: CLI / TUI / Web UI / IDE / MCP   │
├─────────────────────────────────────────────────────┤
│  Domain: Entities, Services, Policies               │
│  (Quest, Submission, GuildSeal, Coordinator, ...)   │
├─────────────────────────────────────────────────────┤
│  Ports: Abstract interfaces                         │
│  (RoadmapPort, SubmissionPort, WorkspacePort, ...)  │
├─────────────────────────────────────────────────────┤
│  Adapters: WARP graph ↔ Domain mapping              │
│  (WarpRoadmapAdapter, WarpSubmissionAdapter, ...)   │
├─────────────────────────────────────────────────────┤
│  WARP Graph: Multi-writer CRDT with causal ordering │
├─────────────────────────────────────────────────────┤
│  Settlement: Git (content-addressed object store)   │
└─────────────────────────────────────────────────────┘
```

Hexagonal architecture. The domain layer is pure — no infrastructure concerns. The WARP graph handles convergence. Git handles persistence. Everything above the graph is a projection.

## Who is XYPH For?

- **Teams mixing humans and AI agents** who need deterministic coordination without a central server.
- **Projects that need provable completion** — not "the ticket says done" but "the graph proves done."
- **Anyone tired of reconstructing project state** from five different tools and a Slack thread.
