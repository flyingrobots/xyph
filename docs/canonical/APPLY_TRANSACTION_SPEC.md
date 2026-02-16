# APPLY_TRANSACTION_SPEC.md
**Title:** Apply Transaction Spec  
**Version:** 1.0.0  
**Status:** ACTIVE  
**Enforcement:** HARD REJECT  
**Scope:** Defines exactly how a `PlanPatchArtifact` mutates roadmap state atomically.

---

## 1) Purpose

`APPLY` is the only write gate in the planning compiler.  
This spec defines:

- atomicity rules,
- optimistic concurrency rules,
- rollback guarantees,
- receipt format,
- failure semantics.

If this section is ambiguous, the system is nondeterministic. If it’s nondeterministic, it’s broken.

---

## 2) Transaction Model

### 2.1 Unit of work

A single apply transaction consists of:

1. `precondition` check (snapshot + approvals + signature)
2. ordered execution of `operations[]`
3. postcondition verification
4. commit of new snapshot + append-only receipt

This is all-or-nothing.

### 2.2 Atomicity contract

- Either every operation in `operations[]` is applied and committed
- Or zero durable state changes are visible after transaction end

No half-commits.
No “mostly worked.”
No vibes-based success.

---

## 3) Inputs

### 3.1 Required input artifact

`PlanPatchArtifact` must include:

- `schemaVersion = v1.0`
- `patchId`
- `runId`
- `baseSnapshotDigest`
- `operations[]` (ordered, deterministic)
- `rollbackOperations[]` (ordered inverse)
- `approvals` envelope
- `signature` envelope
- `policyPackRef`
- `configRef`

### 3.2 Preconditions (all mandatory)

1. **Snapshot match**  
   `currentSnapshotDigest == baseSnapshotDigest`  
   else exit code `14` (concurrency drift).

2. **Approval gate satisfied**  
   If review says approval required, approvers and signatures must validate  
   else exit code `12`.

3. **Trust gate satisfied**  
   Signature/key validity must pass trust policy  
   else exit code `13`.

4. **Patch integrity**  
   Hash of canonical patch body must match signed digest  
   else exit code `13`.

---

## 4) Operation Semantics

### 4.1 Allowed op types (closed set)

- `ADD_TASK`
- `UPDATE_TASK`
- `DELETE_TASK`
- `MOVE_TASK_MILESTONE`
- `LINK_DEPENDENCY`
- `UNLINK_DEPENDENCY`
- `ADD_MILESTONE`
- `UPDATE_MILESTONE`
- `DELETE_MILESTONE`

Any unknown op => hard fail (`16`).

### 4.2 Deterministic ordering

Operations MUST be sorted by canonical tuple:

`(phase, entityType, entityId, fieldPath, opIndex)`

Runtime reordering is forbidden.

### 4.3 Referential integrity

During apply:

- dependencies must reference existing tasks
- deletions must not leave dangling refs
- milestones referenced by tasks must exist

Violation => transaction abort, no commit (`11` or `10` based on rule source).

---

## 5) Execution Algorithm

### 5.1 Canonical steps

1. Acquire namespace apply lock.
2. Re-read live snapshot digest.
3. Validate preconditions.
4. Start DB/storage transaction (`TXN`).
5. Apply operations in order.
6. Validate postconditions:
   - schema validity
   - DAG acyclicity
   - milestone reachability
7. Compute `newSnapshotDigest`.
8. Persist snapshot + append `ApplyReceipt`.
9. Commit `TXN`.
10. Release lock.

If any step fails before commit: rollback `TXN`.

---

## 6) Rollback Model

### 6.1 Automatic rollback

If failure occurs after partial in-memory application but before durable commit:
- storage transaction rollback handles revert (primary path).

### 6.2 Compensating rollback

If failure occurs after an external side effect (should be avoided, but reality bites):
- apply `rollbackOperations[]` as compensating patch
- emit `ROLLED_BACK` terminal receipt
- exit code `17` or `18` if compensation fails

### 6.3 Rollback validity

`rollbackOperations[]` must be precomputed and validated at `EMIT`, not invented during panic mode.

---

## 7) Locking + Concurrency

### 7.1 Namespace lock

Only one `APPLY` may run per roadmap namespace at a time.

### 7.2 Timeout

Default lock wait: 5s.  
Exceeded lock wait => fail with `15`.

### 7.3 Idempotency key

`patchId` acts as idempotency key:
- if same `patchId` already committed, return prior receipt (do not reapply).

---

## 8) Postconditions

A successful `APPLY` MUST guarantee:

1. new snapshot persisted
2. immutable apply receipt persisted
3. provenance chain continuity (`prevReceiptDigest -> currentReceiptDigest`)
4. observably consistent state for subsequent reads

Any missing condition => treated as failed apply.

---

## 9) Apply Receipt Contract

```json
{
  "schemaVersion": "v1.0",
  "receiptId": "APPLY-20260215-ABC123",
  "runId": "RUN-20260215-ABC123",
  "patchId": "PATCH-20260215-ABC123",
  "status": "COMMITTED",
  "timestamp": "2026-02-15T23:59:59Z",
  "baseSnapshotDigest": "blake3:...",
  "newSnapshotDigest": "blake3:...",
  "operationsApplied": 27,
  "durationMs": 842,
  "exitCode": 0,
  "policyPackRef": "POLICY-STRICT-ENG-v1",
  "configRef": "CFG-PROD-v3",
  "signatureVerified": true,
  "approvalVerified": true,
  "receiptDigest": "blake3:...",
  "prevReceiptDigest": "blake3:..."
}
```

If non-commit path:
- status in ["ABORTED","ROLLED_BACK","FAILED"]
- include failure block with code, message, failedOperationIndex (if applicable).

---

## 10) Exit Code Map (Apply-specific)
- 0  committed
- 12 approval failure
- 13 signature/trust failure
- 14 snapshot drift/concurrency mismatch
- 15 lock timeout / budget timeout
- 17 partial apply risk, rollback attempted
- 18 rollback failed (critical)

---

## 11) Safety Rules
1. No side-effecting integrations inside APPLY (email/webhooks/agent calls). Emit event; let async consumers react after commit.
2. No dynamic policy loading mid-transaction. Policy/config refs are frozen from run start.
3. No best-effort writes. Either committed receipt or explicit failed receipt.

---

## 12) Validation Checklist (CI Gate)

apply-spec-check MUST assert:
- all op types are known
- patch hash matches signature envelope
- rollback ops exist and are invertible
- referential integrity passes pre + post
- DAG acyclicity passes post-apply
- idempotency key behavior proven
- failure at each operation index rolls back correctly
- receipt chain hash linkage validated

Any unchecked box => reject merge.

---

## 13) Non-Negotiable Reject Triggers
1. Attempt to apply with missing baseSnapshotDigest
2. Missing or invalid rollbackOperations[]
3. Unsatisfied approval gate for critical-path/scope-expanding changes
4. Signature unverifiable against trust root
5. Post-apply DAG cycle
6. Receipt not persisted atomically with snapshot
