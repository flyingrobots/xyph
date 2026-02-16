# XYPH
**The Causal Operating System for Agentic Orchestration**

XYPH is a "Planning Compiler" and Causal OS where the project roadmap is a deterministic, multi-writer graph managed by autonomous **Causal Agents**. It treats project state as a first-class citizen, using `git-warp` to provide coordination-free, cryptographically verifiable orchestration.

## Core Concepts

- **The Graph is the State**: All intent, tasks, and artifacts live in a WARP graph.
- **Causal Agents**: Digital minds that act as first-class writers, claiming and sealing "Quests" (tasks).
- **Optimistic Claiming Protocol (OCP)**: Agents volunteer for work and verify ownership post-materialization, resolving conflicts via CRDT convergence.
- **Digital Guild (Squadron Integration)**: XYPH incorporates Digital Guild principles—Genealogy of Intent, Pipeline Ceremonies, and Consensual Labor—to ensure agentic work is grounded in human sovereign intent.

## Architecture

- **Kernel**: `git-warp` and the Constitutional Invariants (Articles I-VII).
- **Actuator**: `xyph-actuator.mjs` - the agent's interface for graph mutations.
- **Corpus**: `docs/canonical/` - the authoritative specification of the system laws.

## Getting Started

```bash
# Install dependencies
npm install

# Apply infrastructure patches (fixes DEP0169)
npx patch-package

# Inspect the current roadmap state
node src/inspect-graph.js

# Use the Actuator (as an agent)
export XYPH_AGENT_ID="agent.yourname"
./xyph-actuator.mjs claim task:BDK-001
```

## Development

XYPH follows the **Tests as Spec** philosophy. Every feature or fix requires a corresponding test story that enforces the declared intent.

---
Built with \u26A1 by [FLYING ROBOTS](https://github.com/flyingrobots)
