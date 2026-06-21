# XYPH

A sovereign agentic planning substrate and Edict execution runtime designed for the [Continuum](https://github.com/flyingrobots/continuum) post-Unix platform. 

XYPH replaces traditional central-database ticketing systems with a distributed network of **Continuum Participants** that materialize project planning coordinates (Intents, Quests, Scrolls, and Policies) directly from an immutable, verifiable causal history.

> [!WARNING]
> **ROADMAP ALIGNMENT**
> While XYPH currently operates as a local-first TypeScript CLI and TUI over git-warp graphs, it is actively transitioning to a native Continuum Participant. The Edict compilation, capability-bound execution lanes, and peer-to-peer Continuum sync protocols described below represent our target architecture.

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

## Documentation Map

To orient yourself, follow the authoritative manifests in order:

1. **The Entrance**:
   * [GUIDE.md](file:///Users/james/git/xyph/GUIDE.md) — Orientation, Digital Guild nouns, and quick checklist.
2. **The Bedrock**:
   * [ARCHITECTURE.md](file:///Users/james/git/xyph/docs/canonical/ARCHITECTURE.md) — Authoritative structural references (Hexagonal, Ports, WARP).
   * [docs/VISION.md](file:///Users/james/git/xyph/docs/VISION.md) — Stigmergic tenets and the mission.
   * [METHOD.md](file:///Users/james/git/xyph/docs/canonical/METHOD.md) — Work doctrine and cycle loops.
3. **The Direction**:
   * [docs/BEARING.md](file:///Users/james/git/xyph/docs/BEARING.md) — Current release posture and strategic target.
   * [docs/xyph-git-warp-evolution.md](file:///Users/james/git/xyph/docs/xyph-git-warp-evolution.md) — Optical query and speculative strand roadmap.
   * [docs/xyph-edict-integration.md](file:///Users/james/git/xyph/docs/xyph-edict-integration.md) — Sandbox boundaries and Edict target profiles.

---

Built with geometric lawfulness for the post-Unix era by [FLYING ROBOTS](https://github.com/flyingrobots).
