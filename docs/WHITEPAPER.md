# XYPH: A Cryptographic Coordination Layer for Autonomous Agents
> **Moving from fragile scripts to immutable, graph-based agency.**

## Abstract
Current multi-agent systems rely on ephemeral message buses and fragile "orchestrator" scripts. These systems lack memory, provenance, and resilience. If the orchestrator dies, the swarm dies. XYPH is a decentralized operating system for agents where the **Graph is the State**. By utilizing Conflict-Free Replicated Data Types (CRDTs) over a Git substrate, XYPH allows agents to coordinate asynchronously, resolve race conditions deterministically, and build a cryptographic resume of their work.

## 1. The Problem: Ephemeral Agency
Agents today are stateless. They wake up, perform a task, and vanish. Their history is lost in log files.
- **No Provenance**: Who approved this code? Which agent hallucinations caused this bug?
- **Race Conditions**: Two agents grabbing the same ticket requires a central lock manager.
- **Fragility**: Centralized orchestration is a single point of failure.

## 2. The Solution: The Graph as OS
XYPH treats the `git-warp` graph as the shared memory space.
- **Coordination via Stigmergy**: Agents do not talk to each other; they modify the environment (the graph). An agent sees a "dirty" node and cleans it.
- **Deterministic Conflict Resolution**: Using Last-Writer-Wins (LWW) and Observed-Remove Sets (OR-Sets), the graph mathematically resolves collisions without a master server.
- **Cryptographic Identity**: Every agent is a Writer with a public key. Every pixel of work is signed.

## 3. The Economy of Work
In XYPH, work is a transaction.
1. **Bid**: Coordinator posts a Task node.
2. **Claim**: Worker writes an `assigned_to` edge.
3. **Settle**: The graph merges patches. If the Worker’s claim survives the merge, they execute.
4. **Proof**: Worker commits the result (code/text) and links it to the Task.

## 4. Architecture
### 4.1 The Core: git-warp
The underlying storage engine.
- **Storage**: `.git/objects` (Content Addressed).
- **Sync**: `git push` / `git pull` (or direct HTTP sync).
- **Logic**: Node.js runtime wrapping the WARP core.

### 4.2 The Agent Runtime (xyph-d)
A lightweight daemon that wraps an LLM.
- **Identity Manager**: Generates `agent:uuid`. Manages cryptographic keys.
- **The Loop**: A reactive `graph.watch()` listener that triggers on specific node patterns.
- **The Actuator**: A write-buffer that commits patches to the graph.

### 4.3 Node Taxonomy
The graph is typed. Agents are programmed to react to specific Types.

| Node Type | Properties | Edge Relationships |
|-----------|------------|--------------------|
| **Task** | status, priority, bounty | belongs_to (Milestone), assigned_to (Agent) |
| **Agent** | model, uptime, cost_per_token | possesses (Skill) |
| **Artifact** | uri, hash, type | generated_by (Agent), fulfills (Task) |
| **Signal** | type (heartbeat, error) | emitted_from (Agent) |
