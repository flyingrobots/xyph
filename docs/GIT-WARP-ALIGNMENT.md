# git-warp Alignment Report

**Date:** 2026-03-07
**Scope:** Full audit of XYPH design documents, code, diagrams, roadmap tasks,
and JSON schemas against the actual behavior of git-warp v13.1.0.
**Motivation:** Multiple canonical design documents described a centralized
transaction model (locks, DB transactions, snapshot preconditions, rollback)
that does not exist in git-warp's CRDT substrate.

---

## 1. Background: How git-warp Actually Works

git-warp is a **CRDT graph database stored inside Git**. Understanding these
five properties is essential for anyone writing XYPH design documents:

1. **No locks.** Multiple writers emit patches concurrently. There is no
   namespace lock, no mutual exclusion, no "wait your turn."

2. **No transactions.** Each `graph.patch()` call produces a single atomic
   Git commit pointing to the empty tree. There is no multi-step TXN to
   start, commit, or rollback.

3. **No centralized snapshot.** State is the deterministic result of replaying
   all patches from all writers in Lamport order. There is no single
   authoritative snapshot to compare against.

4. **Append-only.** Committed patches are immutable Git objects. You cannot
   undo a patch. You can only emit a new compensating patch that overrides
   properties via LWW or re-adds/removes tombstoned nodes and edges.

5. **Deterministic convergence.** Regardless of patch arrival order, all
   materializations produce the same final state:
   - Nodes and edges: OR-Set (add wins over concurrent remove).
   - Properties: LWW (highest Lamport tick wins; ties broken by writerId,
     then patchSha, then opIndex).

XYPH has two conceptual layers:
- **Layer 1 — git-warp substrate:** The CRDT engine. No locks, no transactions.
- **Layer 2 — Planning compiler:** Application-layer logic that validates
  domain rules, checks approval gates, and emits patches. This layer has
  opinions about what mutations are valid, but it enforces them *before*
  calling `graph.patch()`, not via centralized database mechanisms.

---

## 2. Changes Already Made (commit `9a51e20`)

These fixes were applied in this audit session.

### 2.1 Documents Rewritten

| Document | What Changed |
|----------|-------------|
| `APPLY_TRANSACTION_SPEC.md` | Complete rewrite. Removed namespace locks, DB transactions, snapshot preconditions, compensating rollback. Reframed as domain validation + `graph.patch()` emission. Now accurately describes the CRDT concurrency model. |
| `CONSTITUTION.md` (v1.1.0) | Art. II §2.2: Relaxed orphan rule (campaign membership is optional). Art. II §2.3: Fixed `blockedBy` → `depends-on`. Art. III §3.1: Distinguished writerId attribution from cryptographic signing. Art. III §3.3: Replaced "inverse RollbackPatch" with compensating patches via LWW. |
| `SECURITY_AND_TRUST.md` | Rewrote: distinguished writerId attribution from Guild Seal signing. Clarified authorization is pre-patch domain logic, not a centralized gatekeeper. |
| `AUDIT_AND_PROVENANCE.md` | Removed `beforeSnapshotRef` / `afterSnapshotRef`. Replaced rollback section with forward-only correction model. |
| `SCHEDULING_AND_DAG.md` (v1.1.0) | Fixed critical path: `weightedLongestPath()` (DP over topo order), not Dijkstra. Added git-warp traversal primitive reference table. |
| `PATCH_OPS_INVARIANTS.md` (v1.1.0) | Added scope note clarifying this is an application-layer format, not git-warp primitives. Added rollback semantics note. |
| `POLICY_ENGINE.md` | Fixed `blockedBy` → `depends-on` terminology. |

### 2.2 Documents with Targeted Fixes

| Document | What Changed |
|----------|-------------|
| `ORCHESTRATION_SPEC.md` | Removed `ROLLED_BACK` state from FSM. Rewrote §4.9 EMIT (removed RollbackPatchArtifact). Rewrote §4.10 APPLY (domain validation + `graph.patch()`). Rewrote §8 Concurrency (CRDT, no locks). Removed exit codes 14, 17, 18. |
| `AUDIT_EVENT_SCHEMA.json` | Removed `ROLLED_BACK` from state enums. |
| `README.md` | Fixed APPLY_TRANSACTION_SPEC description. |
| `Orchestration.ts` | Removed `ROLLED_BACK` from `OrchestrationState` type. |

### 2.3 Diagrams

| Diagram | What Changed |
|---------|-------------|
| `transaction-lifecycle.mmd` | **Deleted.** Depicted a fictional lock → TXN → rollback pipeline. |
| `orchestration-fsm.mmd` | Removed `ROLLED_BACK` state. |
| `planning-pipeline.mmd` | Removed `ROLLED_BACK` state. |
| `trust-pipeline.mmd` | Rewrote: shows pre-patch domain validation → `graph.patch()`, not a centralized gatekeeper. |
| `audit-chain.mmd` | Rewrote: shows `graph.patch()` → Git SHA → `patchesFor()` provenance, not PlanPatch → ApplyReceipt. |

### 2.4 Roadmap Tasks (WARP Graph Patches)

| Task | What Changed |
|------|-------------|
| `task:FRG-002` | Title: removed "RollbackPatch generation" from EMIT phase. |
| `task:FRG-003` | Title: replaced "optimistic concurrency check + atomic commit" with "domain validation + graph.patch() + audit record". |
| `task:ORC-004` | Title: replaced "Greedy coloring" with `graph.traverse.levels()`. |
| `campaign:FORGE` | Description: replaced "optimistic concurrency" with "graph.patch() emission". |

### 2.5 Guardrails Added

| File | What Was Added |
|------|---------------|
| `CLAUDE.md` | New rule: "NEVER describe git-warp using centralized-database vocabulary" with specific banned terms and correct substitutions. Fixed git-warp version: v12.1.0 → v13.1.0. |
| `CONTRIBUTING.md` | New "Design Doc Accuracy" section explaining git-warp's CRDT nature and correct vocabulary for design documents. |

---

## 3. Remaining Issues — RESOLVED

All items from Section 3 have been resolved. §3.10 is deferred (low-priority
mockup) — it will be updated when the compiler TUI is built.

### 3.1 ✅ ORCHESTRATION_SPEC.md §4.5 MERGE — "snapshot mismatch"

Replaced "snapshot mismatch" with "unresolvable entity conflict" in
`docs/canonical/ORCHESTRATION_SPEC.md`.

### 3.2 ✅ `PATCH_OPS_SCHEMA.json` — `baseSnapshotDigest` field

Option (a) applied: field retained as advisory. Added `description` to
`docs/canonical/PATCH_OPS_SCHEMA.json` and invariant 12 to
`PATCH_OPS_INVARIANTS.md` documenting it as an audit correlation
fingerprint, not a concurrency precondition.

### 3.3 ✅ `AUDIT_EVENT_SCHEMA.json` — `rollbackPatchDigest` field

Added `"deprecated": true` and `"description"` noting this is vestigial
from the pre-CRDT transaction model. Field remains optional for backward
compatibility with existing audit records.

### 3.4 ✅ `README.md` — Planning pipeline description

Replaced "all-or-nothing atomicity with automatic rollback" with
`graph.patch()` atomicity description.

### 3.5 ✅ `README.md` — Constitution summary

Replaced "every patch has an inverse for rollback" with "corrections are
made via compensating patches (LWW overrides), not transactional rollback".

### 3.6 ✅ `WHITEPAPER.md` — "work is a transaction"

Replaced with "In XYPH, work is a causal chain."

### 3.7 ✅ `EXECUTIVE_SUMMARY.md` — "cryptographically auditable"

Replaced "signed, timestamped" with "attributed to its author,
content-addressed by Git, and traceable through the patch history".

### 3.8 ✅ `EXECUTIVE_SUMMARY.md` — test count

Updated "900+ tests" to "650+ tests".

### 3.9 ✅ `AGENT_CHARTER.md` — `blockedBy/blocking` terminology

Replaced "milestoneId + tentative blockedBy/blocking" with "campaign +
tentative depends-on edges".

### 3.10 ⏳ `tui_6_compiler.svg` mockup — DEFERRED

Low-priority mockup. Will be updated when the compiler TUI is built.
Mockups are aspirational, not normative.

### 3.11 ✅ `schemas/PATCH_OPS_SCHEMA.v1.json` — `keyId` pattern divergence

Runtime schema `keyId` pattern synced to the canonical multibase Base58btc
pattern: `^(?:KEY-[A-Z0-9]{6,24}|did:key:z[1-9A-HJ-NP-Za-km-z]{10,100})$`.
The old pattern (`z6[A-Za-z0-9]+`) accepted invalid Base58btc characters
(`0`, `O`, `I`, `l`) and had no length bounds. Test fixtures, keyring, and
fixture-generation scripts updated to use properly derived `did:key`
identifiers.

---

## 4. Design Decisions Required

These are not bugs — they're architectural questions surfaced by the audit.

### 4.1 What is the PlanPatchArtifact's role going forward?

The `PATCH_OPS_SCHEMA.json` and `validatePatchOps.ts` define a rich
application-layer validation format with operations, rollback mirrors, and
signature envelopes. This system:

- **IS** implemented and tested (matrix tests validate invariants).
- **IS NOT** wired into the actual write path (the actuator calls
  `graph.patch()` directly with ad-hoc operations).

**Question:** Should the planning compiler (Milestones 8-9: Oracle + Forge)
use this format as an intermediate representation between EMIT and APPLY?
Or should it be retired in favor of direct `graph.patch()` calls?

**Trade-offs:**
- **Keep it:** Provides a signed, auditable, deterministic operation manifest
  that can be reviewed before application. The rollback mirror proves the
  compiler *could* compute an inverse — useful for confidence scoring.
- **Retire it:** Removes a layer of indirection. The actuator already calls
  `graph.patch()` directly; adding a PlanPatchArtifact intermediary creates
  two representations of the same mutation.

**Recommendation:** Keep the PlanPatchArtifact as a **planning compiler
artifact** — an auditable manifest that is validated, signed, and stored
before its operations are translated to `graph.patch()` calls. But be
explicit in docs that it's an application-layer construct, not a git-warp
primitive. The `PATCH_OPS_INVARIANTS.md` update already does this.

### 4.2 Should `rollbackOperations[]` be removed from PlanPatchArtifact?

The rollback mirror (invariants 1-3) proves the compiler can compute
operation inverses. In the CRDT model, these inverses are never *executed*
as a transaction rollback — they would be emitted as new compensating patches.

**Options:**
- **(a) Keep as validation artifact:** The mirror proves invertibility at
  compile time. Useful for confidence scoring and simulation mode.
- **(b) Remove:** Simplify the schema. Compensating patches are computed
  on-demand if needed, not pre-computed.

**Recommendation:** Option (a) for now. The mirror has value as a proof of
invertibility. Rename from `rollbackOperations` to `inverseOperations` to
avoid the "rollback" connotation.

### 4.3 Should XYPH enforce write policies in the substrate?

Currently, git-warp has no access control — any writer with repo access can
emit any patch. XYPH enforces policies (approval gates, sovereignty checks)
in the actuator's command handlers *before* calling `graph.patch()`.

This means a rogue writer could bypass the actuator and emit raw patches
that violate XYPH's domain rules. The policies are enforced at the
application layer, not the substrate layer.

**Question:** Is this acceptable?

**Assessment:** Yes, for the current architecture. git-warp's
[design](https://github.com/git-stunts/git-warp/blob/main/ARCHITECTURE.md)
intentionally avoids baked-in access control to stay runtime-agnostic.
XYPH's domain validation is the correct layer for policy enforcement.
A malicious writer bypassing the actuator is equivalent to pushing
unauthorized Git commits — a social/operational concern, not an
architectural one. Repository access controls (SSH keys, branch protection)
are the appropriate defense.

---

## 5. Vocabulary Reference

When writing XYPH design documents, use these substitutions:

| Instead of... | Write... |
|---------------|----------|
| "Lock the namespace" | "Validate preconditions before emitting" |
| "Start a transaction" | "Call `graph.patch()`" |
| "Commit the transaction" | "The patch committed as a Git object" |
| "Rollback the transaction" | "Emit a compensating patch" or "The patch was not committed" |
| "Snapshot precondition" | "Materialized state at pipeline start" (advisory, not a gate) |
| "Optimistic concurrency check" | "Post-apply consistency check" (advisory) |
| "Atomic commit" | "`graph.patch()` atomicity" (one patch = one Git commit) |
| "Dijkstra for critical path" | "`weightedLongestPath()` (DP over topological order)" |
| "Idempotency key" | "Content-addressed deduplication (same ops = same Git SHA)" |
| "Every mutation is signed" | "Every mutation is attributed by writerId; Guild Seals sign completion artifacts" |
| "Database" | "CRDT graph" or "WARP graph" |

---

## 6. Verification Checklist

For future design doc reviews, check each of these:

- [ ] Does the document reference locks, transactions, or centralized snapshots?
- [ ] Does it describe rollback as a mechanism (vs. compensating patches)?
- [ ] Does it conflate writerId attribution with cryptographic signing?
- [ ] Does it describe graph algorithms that should use `graph.traverse.*`?
- [ ] Does it use `blockedBy` instead of `depends-on`?
- [ ] Does it reference `ROLLED_BACK` as a pipeline state?
- [ ] Does it claim Dijkstra for critical path (should be longest path DP)?
- [ ] Does it describe the approval gate as a centralized gatekeeper
      (should be pre-patch domain validation)?

If any box is checked, the document needs correction.
