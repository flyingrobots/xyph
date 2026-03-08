# APPLY_TRANSACTION_SPEC.md
**Title:** Apply — Graph Mutation Gate
**Version:** 2.0.0
**Status:** ACTIVE
**Enforcement:** HARD REJECT
**Scope:** Defines how the planning compiler's `APPLY` phase emits WARP patches to the graph.

---

## 1) Purpose

`APPLY` is the final phase of the planning compiler pipeline.
It translates validated, approved domain operations into git-warp `graph.patch()` calls.

This spec defines:

- what validation happens before emitting patches,
- how domain operations map to git-warp primitives,
- error handling when patch emission fails,
- the audit trail for applied mutations.

---

## 2) Substrate: git-warp CRDT Model

XYPH's graph is a git-warp WARP graph — a CRDT database stored inside Git.

**Key properties that constrain this spec:**

- **No locks.** Multiple writers can emit patches concurrently. There is no
  namespace lock, no mutual exclusion, no "wait your turn."
- **No transactions.** Each `graph.patch()` call produces a single atomic Git
  commit. There is no multi-step TXN to start/commit/rollback.
- **No centralized snapshot.** State is the deterministic result of replaying
  all patches from all writers in Lamport order. There is no single authoritative
  snapshot to compare against.
- **Append-only.** Committed patches are immutable Git objects. You cannot undo
  a patch — you can only emit a new patch that overrides properties via LWW
  (Last-Writer-Wins) or re-adds tombstoned nodes/edges.
- **Deterministic convergence.** Regardless of patch arrival order, all
  materializations produce the same final state (OR-Set for existence,
  LWW for properties).

---

## 3) Pre-Apply Validation

Before calling `graph.patch()`, the APPLY phase MUST validate:

### 3.1 Domain integrity

- All referenced nodes exist in the materialized graph (or are being created
  in this patch).
- No `depends-on` edge would create a cycle. Use `graph.traverse.isReachable()`
  for pre-check.
- DAG acyclicity is preserved.

### 3.2 Approval gates

- If the pipeline's REVIEW phase flagged approval-required (critical path change,
  scope increase >5%), the approval must be satisfied before APPLY proceeds.
- Unsatisfied approval gate => APPLY refuses to emit. Pipeline terminates with
  a domain error.

### 3.3 Signature verification

- If the `PlanPatchArtifact` carries a signature envelope, verify the Ed25519
  signature against the keyring before emitting.
- Invalid signature => APPLY refuses to emit.

---

## 4) Mutation Mapping

### 4.1 Domain ops to git-warp primitives

The planning compiler's domain operations map to git-warp's six primitives:

| Domain Operation | git-warp Primitive(s) |
|------------------|-----------------------|
| `ADD_TASK` | `p.addNode(id).setProperty(id, 'type', 'task').setProperty(...)` |
| `UPDATE_TASK` | `p.setProperty(id, key, value)` (LWW — highest Lamport wins) |
| `DELETE_TASK` | `p.removeNode(id)` (OR-Set tombstone) |
| `MOVE_TASK_MILESTONE` | `p.removeEdge(id, old, 'belongs-to').addEdge(id, new, 'belongs-to')` |
| `LINK_DEPENDENCY` | `p.addEdge(from, to, 'depends-on')` |
| `UNLINK_DEPENDENCY` | `p.removeEdge(from, to, 'depends-on')` |
| `ADD_MILESTONE` | `p.addNode(id).setProperty(id, 'type', 'campaign').setProperty(...)` |
| `UPDATE_MILESTONE` | `p.setProperty(id, key, value)` |
| `DELETE_MILESTONE` | `p.removeNode(id)` |

### 4.2 Atomicity

A single `graph.patch(p => { ... })` call groups all operations into one
Git commit. Either the commit succeeds (all ops applied) or it fails (no
ops applied). This is git-warp's natural atomicity boundary — one patch,
one commit.

### 4.3 Deterministic ordering

Operations within a patch are applied in the order they appear in the
callback. The planning compiler MUST emit operations in canonical order:

`(phase, entityType, entityId, fieldPath)`

This ensures deterministic patch content and stable content-addressed SHAs.

---

## 5) Concurrency Model

### 5.1 No locking required

git-warp writers operate independently. Two concurrent APPLY runs by
different writers will each emit their own patch. The patches converge
deterministically at materialization time via CRDT merge rules:

- **Node/edge existence:** OR-Set (add wins over concurrent remove).
- **Properties:** LWW (highest Lamport tick wins; ties broken by writerId,
  then patchSha).

### 5.2 Conflict detection (optional, advisory)

The planning compiler MAY perform a **post-apply consistency check**:

1. Re-materialize after emitting the patch.
2. Verify the resulting state matches expectations (e.g., the task is in the
   expected status, the dependency edge exists).
3. If unexpected state is detected, log a warning. The CRDT guarantees
   convergence — the state is always valid — but it may not match the
   compiler's intent if a concurrent writer modified the same entities.

This is advisory, not mandatory. The graph is always consistent.

### 5.3 Content-addressed deduplication

git-warp patches are Git commits. Identical operations produce the same
Git tree object, but commit SHAs also incorporate metadata (author,
committer, timestamps, parent commits), so two APPLY runs at different
times will produce different commit SHAs even with identical payloads.
Application-level deduplication, if needed, should use an explicit
idempotency key (e.g., `patchId` in the PlanPatchArtifact) rather than
relying on commit SHA identity.

---

## 6) Error Handling

### 6.1 Pre-apply failures

If validation (Section 3) fails, APPLY does not emit any patch.
The pipeline transitions to FAILED with a descriptive error.

### 6.2 Patch commit failures

If `graph.patch()` throws (e.g., Git I/O error, ref update CAS failure):

- The patch was not committed. No state change occurred.
- The pipeline MAY retry once (transient I/O). On second failure, transition
  to FAILED.

### 6.3 Compensating mutations

There is no "rollback" in git-warp. If a patch was successfully committed
but later found to be incorrect:

- Emit a **new compensating patch** that sets properties back to their
  prior values via LWW overrides, re-adds removed nodes/edges, or removes
  incorrectly added ones.
- This is a forward-only correction, not a transaction rollback.

---

## 7) Audit Trail

Every APPLY execution (success or failure) MUST produce an `AuditRecord`
(see ORCHESTRATION_SPEC.md Section 7) containing:

- `runId`, `fromState: 'EMIT'`, `toState: 'DONE' | 'FAILED'`
- `inputDigest` — BLAKE3 hash of the PlanPatchArtifact
- `outputDigest` — the Git commit SHA returned by `graph.patch()` (on success)
- `decisionSummary` — human-readable summary of operations applied
- `durationMs`

The audit record is itself written to the WARP graph as a node, making it
part of the immutable, content-addressed history.

---

## 8) Safety Rules

1. No side-effecting integrations inside APPLY (email, webhooks, agent calls).
   Emit the patch; let async consumers react to graph change subscriptions.
2. Policy and config refs are frozen from pipeline start. No dynamic loading
   during APPLY.
3. Every APPLY produces either a successful commit SHA or a FAILED audit
   record. No silent failures.
