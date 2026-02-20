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

XYPH is a Planning Compiler and Causal OS where the project roadmap is a deterministic, multi-writer graph managed by autonomous **Causal Agents**. It treats project state as a first-class citizen — using `git-warp` to provide coordination-free, cryptographically verifiable orchestration.

## Core Concepts

- **The Graph is the State**: All intent, quests, and artifacts live in a single WARP graph. No database. No server. Git is the coordination layer.
- **Genealogy of Intent**: Every quest must trace back to a human-declared `intent:` node (Constitution Art. IV). Agents cannot be sovereign roots.
- **Causal Agents**: Digital guild members that act as first-class writers, claiming and sealing Quests with cryptographic Guild Seals.
- **Optimistic Claiming Protocol (OCP)**: Agents volunteer for work and verify ownership post-materialization, resolving conflicts via CRDT convergence.
- **Stigmergy**: Coordinate by modifying the graph — not by messaging each other.

## Architecture

```text
src/
├── domain/           # Pure domain models and entities (Quest, Intent, ApprovalGate, ...)
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

## Getting Started

```bash
# Install dependencies
npm install

# Run the interactive WARP Dashboard
XYPH_AGENT_ID=human.yourname ./xyph-dashboard.tsx

# Run tests
npm run test:local    # no Docker required
npm test              # full Docker suite

# Build (TypeScript)
npm run build
```

## Dashboard Keys

| Key     | Action                                      |
|---------|---------------------------------------------|
| `Tab`   | Cycle views (roadmap → lineage → all → inbox) |
| `↑↓`   | Navigate                                    |
| `Space` | Fold/unfold milestone · open quest detail   |
| `r`     | Refresh snapshot                            |
| `?`     | Help modal                                  |
| `q`     | Quit                                        |
| `p`     | Promote inbox task (human.* only)           |
| `x`     | Reject inbox task                           |
| `Esc`   | Close modal                                 |

## Actuator Commands

```bash
export XYPH_AGENT_ID="agent.yourname"

# Declare a sovereign Intent (human only)
./xyph-actuator.ts intent intent:MY-001 \
  --title "Build the thing" --requested-by human.yourname

# Initialize a Quest (requires --intent)
./xyph-actuator.ts quest task:MY-001 \
  --title "Implement foo" --campaign campaign:MY --intent intent:MY-001

# Claim a Quest (Optimistic Claiming Protocol)
./xyph-actuator.ts claim task:MY-001

# Seal a Quest DONE (produces a Guild-signed Scroll)
./xyph-actuator.ts seal task:MY-001 \
  --artifact <blake3-hash> --rationale "Implemented and tested"

# Generate a cryptographic keypair for your agent
./xyph-actuator.ts generate-key

# Audit sovereignty violations
./xyph-actuator.ts audit-sovereignty

# Triage an inbox task
./xyph-actuator.ts inbox task:MY-001 \
  --title "Proposed feature" --suggested-by human.yourname
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

---

Built with Ω¹ by [FLYING ROBOTS](https://github.com/flyingrobots)

<sub>¹ Ω (Omega) — the final convergence point of the WARP graph; symbolizes deterministic state resolution.</sub>
