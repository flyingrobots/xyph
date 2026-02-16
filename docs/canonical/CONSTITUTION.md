# CONSTITUTION OF THE PLANNING COMPILER
**Version:** 1.0.0
**Enforcement:** HARD REJECT

## ARTICLE I: THE LAW OF DETERMINISM
1.1. **Idempotency:** Given the same Input State ($S_0$) and Policy Set ($P$), the system MUST produce the exact same Plan Artifact ($A$).
1.2. **No Silent State:** All decision variables must be explicit in the input or configuration. Hidden "temperature" or random seeds are forbidden in the write path.

## ARTICLE II: THE LAW OF DAG INTEGRITY
2.1. **Acyclicity:** The Task Graph must be a Directed Acyclic Graph. Any write that introduces a cycle ($A 	o B 	o A$) is malformed and MUST be rejected at the Ingest gate.
2.2. **Reachability:** Every Task must belong to a Milestone. Orphan tasks are invalid state.
2.3. **Causality:** A Task cannot start until all its `blockedBy` dependencies are in a terminal state (DONE/SKIPPED).

## ARTICLE III: THE LAW OF PROVENANCE
3.1. **Signed Mutations:** No state change occurs without a `PlanPatch` object signed by an Actor (Human or Authorized Agent).
3.2. **Rationale Requirement:** Every mutation (add/move/delete) MUST include a `rationale` string of >10 characters explaining the "Why."
3.3. **Reversibility:** Every `PlanPatch` implies an inverse `RollbackPatch`. The system must be able to compute this inverse automatically.

## ARTICLE IV: THE LAW OF HUMAN SOVEREIGNTY
4.1. **The Kill Switch:** A human Approver can override ANY agent decision.
4.2. **Approval Gates:** Any patch that alters the `Critical Path` or increases `Total Scope` by >5% requires explicit human sign-off.
