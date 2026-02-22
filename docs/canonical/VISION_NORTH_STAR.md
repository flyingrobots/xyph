# VISION_NORTH_STAR.md
**Version:** 1.2.0
**Status:** AUTHORITATIVE

## 0. One Sentence
XYPH is a **causal computer**: a time-travelable, decentralized work + runtime substrate built on WARP graphs — with Git used only as a settlement/object-store layer.

## 1. The Core Mission
XYPH exists to solve the **Agentic Coordination Problem** *and then outgrow it*.

As we move from human-led projects to agent-driven autonomous workflows, we need a substrate that ensures:

- **Deterministic Provenance** (history is the source of truth)
- **Human Sovereignty** (laws, consent, and cryptographic authority)
- **Speculative Collaboration** (parallel worldlines without merge-conflict rituals)

## 2. History-First Computing
XYPH rejects "state-first" thinking. State is a projection; history is the artifact.

- The system can time-travel **data, files, and the runtime itself** back to prior ticks.
- "Branches" are an implementation detail of legacy tooling; **Shadow Working Sets (SWS)** are the native unit of isolation.
- Counterfactuals are first-class: forks are kept, indexed, and queryable.

## 3. The Planning Compiler & Execution Engine
XYPH treats the roadmap not as a document, but as a program to be compiled.

- **Source Code:** Human intent, NL prompts, and formal specs.
- **IR (Intermediate Representation):** The WARP graph.
- **Targets:** Verified artifacts — code, docs, deployments, test receipts, audit receipts.

But XYPH also compiles *execution itself*: jobs, automation, orchestration, and review are all graph-native.

## 4. Layering: Git as Settlement, Not Identity
XYPH may use Git today, but Git is not "the product."

- **Settlement / Object Store (Today):** Git CAS as a ubiquitous, battle-tested content-addressed store.
- **Causal Substrate:** WARP graph + multi-writer convergence.
- **Runtime:** JIT — Just-In-Time graph execution (SWS, promotion, collapse, receipts).
- **Experience Layer:** XYPH CLI/TUI and observer views (status, diff, slice, provenance).

Swapping the settlement layer is allowed long-term; the invariants are not.

## 5. Digital Guild Integration (Squadron)
XYPH adopts the Digital Guild model to govern humans and agents:

- **Genealogy of Intent:** Every `Quest` traces to a human-signed `Intent`.
- **Ceremonies with receipts:** State transitions are legal actions, not UI toggles.
- **Guild Scrolls:** Outputs are signed artifacts stored in the graph.
- **Consensual Labor:** Work is volunteered, not assigned.

## 6. Stigmergic Workflows (the GitHub Replacement Part)
XYPH replaces "Issues / PRs / Actions" with a single principle:

> The graph is the shared environment; coordination emerges from what's written there.

Early scaffolding (temporary names):
- **Submission / Patchset / Review**: append-only proposed changes and feedback.
- **Merge**: a terminal act that emits a signed receipt and seals the quest.
- **Automation**: jobs executed from graph triggers, producing receipts (tests, builds, deploys).

Long-term: "PR" disappears into continuous, local, graph-native review and policy enforcement.

## 7. The End State
A world where:
- "Launching a product" is as deterministic as compiling a binary.
- You can **seek** the system to any prior tick, fork reality, and replay forward.
- Trust, tests, and deployment safety are cryptographically provable — not vibes.
