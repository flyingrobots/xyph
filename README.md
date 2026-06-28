# XYPH

A sovereign agentic planning substrate and Edict execution runtime designed for the [Continuum](https://github.com/flyingrobots/continuum) post-Unix platform.

XYPH replaces traditional central-database ticketing systems with a distributed network of **Continuum Participants** that materialize project planning coordinates (Intents, Quests, Scrolls, and Policies) directly from an immutable, verifiable causal history.

> [!WARNING]
> **ROADMAP & IMPLEMENTATION ALIGNMENT**
> While XYPH currently operates as a local-first TypeScript CLI and TUI over git-warp graphs, it is actively transitioning to a native Continuum Participant. The Edict compilation, capability-bound execution lanes, and peer-to-peer Continuum sync protocols described below represent our target architecture.

---

## The Plain-English Ontology Crosswalk

XYPH rejects generic backlog nouns in favor of a richer Digital Guild ontology intended to preserve distinctions between intent, work, proof, governance, and settled history. Because vocabulary density can become an onboarding moat, use this definitive mapping to orient yourself:

| Digital Guild Noun | Plain-English Infrastructure Equivalent | Core Operational Role in XYPH |
| :--- | :--- | :--- |
| **Quest** | Executable work unit | An atomic task node assigned to an agent or human within admitted boundaries. |
| **Criterion** | Acceptance condition | A testable or reviewable condition required to satisfy a sovereign requirement. |
| **Evidence** | Proof artifact | A verifiable cryptographic receipt, passing test run, or AST digest linked to a criterion. |
| **Settlement** | Governed done | The evidentiary conclusion where work is proven, sealed, and merged into canonical history. |
| **Worldline** | Causal branch / admitted reality | `worldline:live` is admitted truth; speculative worldlines are candidate continuations. |
| **Intent** | Sovereign purpose | The unforgeable human justification defining why work exists (Genealogy of Intent). |
| **Scroll** | Immutable transition record | A cryptographically signed Boundary Transition Record (BTR) proving settlement. |

---

## Reality Check: What is Real Today / What is Next / What is Horizon

We refuse the usual hype shortcuts. To build trust, we are brutally clear about the boundary between our working codebase and our architectural destination:

### 1. What is Real Today (~55–60% Complete)
* **The Dual Human/Agent Product Model**: `xyph-dashboard.ts` (Bijou TUI cockpit) for human operators and `xyph-actuator.ts` (CLI/JSONL/MCP packets) for autonomous agents.
* **Graph-Native Ontology & Storage**: Empty-tree Git commit storage (`git-warp`) ensuring zero filesystem pollution and state-based CRDT convergence.
* **The Semantic Judgment Layer**: `WorkSemanticsService` centralizing derived operational meaning (`attentionState`, `expectedActor`, `nextLawfulActions`, `blockingReasons`) across all surfaces.
* **The Agent Ingress Packets**: Structured machine-facing `briefing`, `next`, `context <id>`, and `submissions` commands.
* **Real Dogfooding**: XYPH stores and reasons about its own development work directly inside its own causal graph.

### 2. What is Next (The Active Clean Sequence)
* **Complete GRAPH-CLEANUP**: Audit and clean up the live graph—seal completed quests, close irrelevant ones, doctor everything else.
* **Modernize SubmissionReadService**: Move legacy monolithic graph materialization behind a bounded optic (`WarpSubmissionReadAdapter`).
* **Scan Reduction**: Add graph-wide scan instrumentation and eradicate brute-force traversal patterns.
* **Shadow graph.watch**: Run reactive streaming side-by-side with legacy timer polling in the dashboard before cutting over.
* **Golden Packet Tests**: Anchor `briefing`, `next`, `context`, and `submissions` with deterministic golden contract tests.

### 3. What is Horizon (The Hard Guarantees)
* **Edict-Style Bounded Admission**: Mandating statically verified Edict nutrition labels before agent execution.
* **Continuum Protocol Exposure**: Full peer-to-peer suffix transport (`continuum.participant.hello.v1`, `continuum.history.exchange.v1`).
* **Cryptographically Hard Settlement**: Cryptographic binding of holographic witness receipts directly to criteria.

---

## Why XYPH?

In a post-Unix architecture, files are not fundamental; they are bounded, materialized readings over causal history. XYPH applies this tenet to coordination:

* **Verifiable Causal Sovereignty**: Every quest or backlog item is linked back to a human-authorized root node through the **Genealogy of Intent**. AI agents cannot hallucinate work; they can only claim and act on cryptographically signed, authorized tasks.
* **Edict Execution Sandbox**: Planning changes and graph mutations are written as **Edict Intents**—safe, statically verified operations. Edict contains the authority blast radius of prompt injections by proving exactly which graph nodes can be touched before code runs.
* **Coordination-Free Concurrency**: Built on [git-warp](https://github.com/git-stunts/git-warp), XYPH coordinates concurrent agent claims offline-first. Diverging worldlines are converged deterministically by Last-Write-Wins (LWW) CRDT semantics, or reconciled via explicit sequenced admission.
* **Cryptographic Settlement**: Quests are sealed with **Scrolls**—cryptographically signed Boundary Transition Records (BTRs). Peer participants or human operators verify quest resolution by inspecting the Scroll's self-contained signature envelope, without needing to walk or download the full repository history.

---

## System Architecture

XYPH functions as a tiered planning and execution runtime:

```text
       ┌───────────────────────────────────────────────────┐
       │              Surface / Interface                  │
       │     Bijou TUI Cockpit · Actuator CLI · TUI API    │
       └─────────────────────────┬─────────────────────────┘
                                 ▼
       ┌───────────────────────────────────────────────────┐
       │        Versioned JSONL Control Plane (XYPH)       │
       │    Canonical interface for queries and commands   │
       └─────────────────────────┬─────────────────────────┘
                                 ▼
       ┌───────────────────────────────────────────────────┐
       │             Edict Execution Runtime               │
       │    Evaluates capability-bound lanes in WASM       │
       │    (continuum.lane.lawful-autonomous/v1)          │
       └─────────────────────────┬─────────────────────────┘
                                 ▼
       ┌───────────────────────────────────────────────────┐
       │          git-warp Causal History Substrate        │
       │    Exchanges causal cones P2P via Continuum      │
       └───────────────────────────────────────────────────┘
```

* **The Cold Path (Authoring)**: Edict source code is statically compiled and verified against target profiles, generating a certified contract bundle stored in the Pre-Admitted Operation Registry.
* **The Hot Path (Execution)**: Autonomous agents or TUI actions invoke the pre-admitted registry using a scoped `CapabilityRef`, a basis coordinate, and an idempotency key.

---

## Quick Start

### 1. Bootstrap Participant
Initialize your local participant node and register your Ed25519 identity keypair:

```bash
npm install
npx tsx xyph-actuator.ts generate-key
npx tsx xyph-actuator.ts login human.ada
```

### 2. Declare and Claim Intent
Wire a new planning requirement back to a sovereign human intent and volunteer for the quest:

```bash
# Declare the root intent (Why the work exists)
npx tsx xyph-actuator.ts intent intent:setup \
  --title "Repository needs Edict verification targets" \
  --requested-by human.ada

# Create a scoped quest linked to the intent
npx tsx xyph-actuator.ts quest task:setup-001 \
  --title "Implement git-warp target profile schema" \
  --intent intent:setup

# Claim the quest (Locks state to IN_PROGRESS under your capability)
npx tsx xyph-actuator.ts claim task:setup-001
```

### 3. Open the Cockpit
Boot the interactive Bijou-powered cockpit to manage work streams and inspect active suggestion lanes:

```bash
npm run tui
```

---

## The Next Clean Sequence

Our immediate engineering execution strictly follows this 7-step sequence. Do not wander. Do not add more nouns. Do not turn the landing cockpit into the everything screen:

1. **Complete GRAPH-CLEANUP**: Audit and clean up the XYPH graph: seal completed quests, close irrelevant ones, doctor the rest.
2. **Modernize `SubmissionReadService`** behind a bounded optic.
3. **Add graph-wide scan instrumentation** and kill the worst offenders.
4. **Shadow `graph.watch`** beside polling in the dashboard.
5. **Add golden packet tests** for `briefing`, `next`, `context`, and `submissions`.
6. **Land one verified capability-bound action path** (action declares intended reads/writes/spend → kernel validates → execution records receipt → dashboard/briefing surfaces it).
7. **Only then push the public XYPH narrative harder.**

---

## Documentation Map

To orient yourself, follow the authoritative manifests in order:

1. **The Entrance**:
   * [GUIDE.md](./GUIDE.md) — Orientation, Digital Guild nouns, and quick checklist.
2. **The Bedrock**:
   * [ARCHITECTURE.md](./docs/canonical/ARCHITECTURE.md) — Authoritative structural references (Hexagonal, Ports, WARP).
   * [docs/VISION.md](./docs/VISION.md) — Stigmergic tenets and the mission.
   * [METHOD.md](./docs/canonical/METHOD.md) — Work doctrine and cycle loops.
3. **The Direction**:
   * [docs/BEARING.md](./docs/BEARING.md) — Current release posture and strategic target.
   * [docs/topics/git-warp-evolution/README.md](./docs/topics/git-warp-evolution/README.md) — Optical query and speculative strand roadmap.
   * [docs/topics/edict-integration/README.md](./docs/topics/edict-integration/README.md) — Sandbox boundaries and Edict target profiles.

---

Built with geometric lawfulness for the post-Unix era by [FLYING ROBOTS](https://github.com/flyingrobots).
