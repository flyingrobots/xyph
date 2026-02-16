# TEST STRATEGY

## Coverage Classes
- **Unit**: schema validators, policy rules, DAG ops
- **Property**: invariants (acyclicity, idempotent normalization)
- **Integration**: phase-to-phase artifact fidelity
- **E2E**: ingest to emitted patch with approval gate

## Determinism
Re-run identical inputs N times; output digests MUST match.

## Fuzz Targets
- malformed dependencies
- duplicate IDs
- pathological milestone splits
- conflicting priority directives
