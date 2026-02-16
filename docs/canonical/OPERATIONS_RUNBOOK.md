# OPERATIONS RUNBOOK

## Common Failure Signatures
- `E_MERGE_CYCLE`: Dependency loop in graph.
- `E_INGEST_PARSE`: Invalid input format.
- `E_CAPACITY_OVERFLOW`: Milestone too heavy for assigned lanes.

## Triage Steps
1. Identify the failing phase in `orchestration.log`.
2. Inspect the input artifact digest.
3. Check policy engine strict mode settings.

## Recovery
- **Rollback**: Use `git mind at <ref>` to revert to last stable snapshot.
- **Manual Intervention**: Fix YAML and re-ingest.
