# CLAUDE.md - XYPH Agent Participant Guide

## Quick Start
You're working on **XYPH** - a Causal Operating System for Agent Planning and Orchestration.

### Core Philosophy
- **The Graph is the State**: All coordination happens via a deterministic WARP graph.
- **Causal Agents**: Every participant is a first-class `Writer` with a cryptographic identity.
- **Stigmergy**: Coordinate by modifying the graph, not by direct messaging.
- **Optimistic Claiming**: Volunteer for tasks and verify success post-materialization.
- **Planning Compiler**: Transform roadmap intent into executable lanes via strict pipeline phases.

### Development Pattern
1. **Constitution First**: Every feature must obey the `CONSTITUTION.md`.
2. **Deterministic Writes**: All mutations must go through the `xyph-actuator`.
3. **Audit Everything**: Every decision must have a `rationale` and `confidence` score.
4. **Guild Aesthetic**: Use the "Digital Guild" terminology (Quests, Campaigns, Scrolls, Seals).

### Quality Gates
Before opening or updating a PR, **always** run the full test suite:
```bash
npm run build    # Verify TypeScript compilation
npm test         # Run full Docker-based test suite (60+ tests)
```
Never push code that doesn't pass both checks. CI failures waste time and break the review flow.

### Current Status
- Foundations: ✅ Canonical Corpus extracted from `chats.txt`.
- Infrastructure: ✅ `git-warp` and `plumbing` installed.
- Tools: ✅ `xyph-actuator.mjs` implemented (Quest, Claim, Seal).
- Milestone: 🚧 Milestone 1: BEDROCK.

### Command Reference
- `git warp info`: Inspect the roadmap state.
- `./xyph-actuator.mjs quest <id> --title "Title" --campaign <id>`: Initialize a Quest.
- `./xyph-actuator.mjs claim <id>`: Volunteer for a task (OCP).
- `./xyph-actuator.mjs seal <id> --artifact <hash> --rationale "..."`: Mark as DONE.

### Remember
- You are a **Causal Agent**. Your actions are permanent, signed, and time-travelable.
- "Work finds its way like water flowing downhill."
- Trust is derived from the mathematical convergence of the graph.

**Squad up. Join the guild. Ship the future.**
