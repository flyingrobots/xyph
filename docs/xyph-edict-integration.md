# Edict Integration: Safe Optics & Bounded Execution Model for XYPH

> [!WARNING]
> **ROADMAP DOCUMENT — NOT PRESENT IMPLEMENTATION TRUTH**
> As of June 21, 2026, Edict is in early alpha. The first alpha issue is open and explicitly covers only parsing and source-AST validation. Core IR, target lowerers, bundle admission, and runtime execution are not yet implemented. This document establishes the target architecture, integration requirements, and conformance constraints for future implementation.

This document outlines how **Edict**—the safe, statically verifiable programming language for Optics—will integrate into XYPH to close the ambient-authority gap for migrated operations, contain the blast radius of prompt injection, and establish secure, verified agent execution.

---

## 1. The Core Architecture

Edict bridges the gap between schema definitions, governance lawpacks, and the underlying `git-warp` causal history runtime. 

Unlike the initial proposal, GraphQL is treated as an adapter rather than XYPH’s sovereign top layer. XYPH's canonical machine interface is its versioned JSONL control plane. Edict is designed to be usable directly over the control plane without GraphQL.

```text
  ┌──────────────────────────────────────────────────────────┐
  │         Surface Adapters (GraphQL / CLI / TUI)           │
  │    Presents views and captures structured inputs         │
  └──────────────────────────┬───────────────────────────────┘
                             ▼
  ┌──────────────────────────────────────────────────────────┐
  │         Canonical JSONL Control Plane (XYPH)             │
  │    Sovereign interface for reading & submitting commands │
  └──────────────────────────┬───────────────────────────────┘
                             ▼
  ┌──────────────────────────────────────────────────────────┐
  │                 Edict Operations (Optics)                │
  │    Statically verified, capability-bound transactions    │
  └──────────────────────────┬───────────────────────────────┘
                             ▼
  ┌──────────────────────────────────────────────────────────┐
  │             git-warp Causal History Runtime              │
  │    Evaluates admission policies, applies target rules   │
  └──────────────────────────────────────────────────────────┘
```

### Path Separation: Cold vs. Hot

We separate the cold compilation/registration path from the hot execution path. Routine agents do not compile fresh source for every action. They invoke pre-admitted law.

```text
AUTHORING / REGISTRATION (Cold Path)
GraphQL Shape IR ─┐
XYPH Lawpack ─────┼─> Edict Compiler -> Core IR -> git-warp Target IR
Edict Source ─────┤                        -> Verifier Report
Target Profile ───┘                        -> Contract Bundle
                                            -> HOLMES Evidence
                                            -> Participant Admission
                                            │  (continuum.lane.lawful-autonomous/v1)
                                            └> Operation Registry

EXECUTION (Hot Path)
Agent / TUI / XYPH API
       │
       │ { bundleDigest, typedInput, basis, capabilityRef, idempotencyKey }
       ▼
Pre-Admitted Operation Registry
       │
       ▼
git-warp Target Executor
       │
       ▼
Typed outcome + patch witness + admission receipt reference
```

---

## 2. Shift I: Planning Rules as Edict Intents (Governance Lawpacks)

XYPH currently separates validation and mutation, sometimes repeating checks inside adapters. By moving the rule, read, guard, and write into a target-owned atomic application, we improve coherence.

Domain rules live in `xyph.governance@1` as a **lawpack**, with an adapter to a generic `gitwarp.causal-graph@1` target. Lawpacks own typed constants, obstructions, operation profiles, budgets, semantic effects, and target adapters, preserving the rule: **XYPH owns product meaning; git-warp owns bedrock mechanics.**

### Conceptual Sample Surgery

Below is the updated conceptual Edict operation for claiming a Quest, correcting previous semantic errors:
* Respects the requirement that claiming requires `READY` status (not `BACKLOG`).
* Permits unassigned quests or existing self-assignments.
* Avoids introducing cycles (cycle prevention belongs to dependency mutation).
* Requires an explicit basis.
* Uses the normative grammar keyword `return` (not `reveal`).
* Delegates the budget to the governance lawpack instead of hardcoding it at the intent layer.
* Returns a minimal receipt rather than disclosing the entire updated entity.

```graphql
package xyph.operations@1;

use shape "schemas/planning.graphql" 
  digest "sha256:8f4c..." as shape;
use lawpack xyph.governance@1 
  digest "sha256:d3e1..." as governance;
use target gitwarp.causal-graph@1 
  digest "sha256:a7b8..." as warp;

intent claimQuest(input: shape.ClaimQuestRequest)
  returns shape.ClaimQuestReceipt
  implements governance.claimQuest
  basis input.basis
  footprint <= governance.claimQuestFootprint
  budget <= governance.claimQuestBudget
{
  let receipt = governance.quest.claim({
    questId: input.questId,
    basis: input.basis,
    grant: input.claimCapability
  }) else {
    missing => governance.QuestMissing,
    invalidStatus(f) => governance.InvalidStatus(f),
    alreadyAssigned(f) => governance.AlreadyAssigned(f),
    staleGuard(f) => governance.StaleBasis(f)
  };

  return receipt;
}
```

*Note: The `xyph.governance` adapter—not the high-level intent—lowers `governance.quest.claim` into exact git-warp property operations and guards.*

---

## 3. Shift II: The Bounded Autonomous Lane (Formerly "YOLO")

We retain "YOLO (You Only Lawfully Operate)" as human-facing branding. However, canonical artifacts must use `continuum.lane.lawful-autonomous/v1` in all hash-significant coordinates.

We split agent operations into two lanes:
1. **Lawful Execution**: Select a pre-compiled, admitted bundle, and supply inputs. Routine agents operate exclusively in this lane.
2. **Lawful Extension**: Propose new Edict source, compile it, verify it, certify it, and seek admission.

### Containing Prompt Injection
Edict **contains the authority blast radius of prompt injection**. It does not solve or prevent prompt injection. If an agent is compromised by an injection:
* It cannot delete the repository or access external networks if its footprint and target profile forbid it.
* However, it *can* still perform unauthorized actions within its permitted aperture (e.g. spamming lawful claims, choosing adversarial inputs, or disclosing data it has legitimate authority to read).

---

## 4. Shift III: Bounded TUI Readings

XYPH's present `ObservationSession` already restricts reads and separates observation from mutation authority. Edict enhances this by offering compile-time proofs of:
* Provably bounded apertures.
* Verified zero logical writes (no logical side-effects).
* Explicit basis and read identity.
* Bounded execution cost and output size.
* Safe, deterministic cache keys.
* Target-directed optic selection and causal slicing.

*Note: We do not promise "zero locks". The compiler guarantees logical read-only effects, not that the runtime implementation avoids internal mutexes.*

---

## 5. Integration Mandates (MUST)

1. **Build the git-warp Target Profile**: This is the primary integration project. We must define the target intrinsics, footprint and cost algebras, Target IR, named failures, verifier, sandbox identity, atomicity model, and conformance fixtures.
2. **Bind Identity to Capability Evidence**: We cannot rely on unauthenticated inputs like `input.agentId`. Reading an Agent node only proves a record exists. We must use a scoped `CapabilityRef`, where participant admission binds the claimant, quest scope, basis, bounds, revocation policy, and policy epoch.
3. **Resolve Claim Concurrency Semantics**: Under current `git-warp` behavior, two concurrent claims can commit locally and converge later via Last-Write-Wins (LWW). A synchronous `ClaimConflict` cannot detect an unseen concurrent claim without coordination. We must choose:
   - *Coordination-free*: Operation returns `ClaimSubmitted`; later observation of the converged graph determines the winning claimant.
   - *Exclusive claim*: Introduce sequenced admission, Compare-And-Swap (CAS), a lease authority, or another coordinating participant.
4. **Make Production Claims Conditional**: Describe the system in future-conditional terms (e.g. "will close the ambient-authority gap for migrated operations") rather than declaring that it currently eliminates FIDLAR across XYPH.
5. **Preserve Failure-Class Separation**: Keep expected domain failures (e.g. invalid quest state) distinct. Compiler failures, admission rejection, integrity faults, resource exhaustion, and internal runtime defects must be separate structured failure classes—not user-defined obstructions.

---

## 6. Guidelines & Adjustments (SHOULD / COULD)

### SHOULD
* **Bundle Registry**: Maintain a registry keyed by semantic digest, with human-readable aliases (e.g., `xyph.claimQuest@1`).
* **Explicit Inputs**: Require every execution request to include an explicit basis, capability receipt digest, and idempotency key.
* **Causal Provenance**: Replace ambient `Date.now()` and random IDs inside the lawful lane with causal coordinates, content-derived IDs, or participant-supplied provenance.
* **Shadow Mode**: Run Edict beside existing TypeScript services in shadow mode, comparing outcomes before making Edict authoritative.
* **Test Reuse**: Re-use existing XYPH concurrent-claim and state-transition tests as target-profile conformance fixtures.
* **Reading Cache Key**: Cache reads based on: `bundleDigest + basisDigest + inputDigest + observerDigest`.

### COULD / COOL IDEAS™
* **Law Nutrition Labels**: Display reads, writes, basis, budget, capability scope, obstruction vocabulary, and bundle digest in the TUI prior to execution.
* **Obstruction Strategies**: Annotate typed failures with recovery metadata (e.g. `retry-after-refresh`, `retry-with-backoff`, `requires-human`, or `terminal`).
* **Footprint-Aware Scheduling**: Run operations with proven-disjoint write footprints in parallel.
* **Law Diffs**: Show static analysis changes in PRs (e.g. "This revision adds one Quest read and widens output by 128 bytes").
* **Historical Lawful Replay**: Reproduce an action against its original basis to verify deterministic outcomes.
* **Aperture Heat Maps**: Visualize graph regions that registered operations are permitted to touch.
