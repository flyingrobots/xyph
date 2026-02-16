# ARCHITECTURE

## Modules
- ingest
- normalize
- classify
- merge
- rebalance
- schedule
- emit
- policy-engine
- graph-core
- audit-log
- review-gate

## Dependency Law
Pipeline modules may depend on graph-core, policy-engine, and schemas.
No module may depend on UI adapters for core logic.

## Data Flow
raw_docs -> ingest -> normalized_tasks -> classified_tasks -> merged_plan
-> rebalanced_plan -> schedule_artifacts -> emitted_patch

## Boundary Rules
- LLMs can propose transformations but cannot commit mutations.
- Storage adapters are replaceable; contracts are not.
