# ORCHESTRATION SPEC
**Version:** 1.0.0
**Enforcement:** STATE TRANSITION VALIDATION

## States
INGEST -> NORMALIZE -> CLASSIFY -> MERGE -> REBALANCE -> SCHEDULE -> EMIT

## Pipeline Overview
raw_docs -> ingest -> normalized_tasks -> classified_tasks -> merged_plan
-> rebalanced_plan -> schedule_artifacts -> emitted_patch

## Phase Definitions
Each phase is a pure function: `input: ArtifactIn -> output: ArtifactOut | Error`.

### Phase 1: Ingest (Raw -> Normalized Tasks)
- **Entry Guard**: Input is Markdown/YAML string or file path.
- **Exit Criteria**: All entities parsed into Task v1.0 schema objects.

### Phase 2: Normalize (Normalized Tasks -> Classified Entities)
- **Entry Guard**: Input is array of Task v1.0 objects.
- **Exit Criteria**: Tasks enriched with userStory, estimates (PERT), and testPlan stubs.

### Phase 3: Classify (Classified Entities -> Merged Plan)
- **Entry Guard**: Input is array of enriched Tasks.
- **Exit Criteria**: Tasks slotted into Milestones/Features via semantic matching.

### Phase 4: Merge (Merged Plan -> Rebalanced DAG)
- **Entry Guard**: Input is slotted Tasks with tentative DAG.
- **Exit Criteria**: Full DAG with no cycles; total hours per Milestone <= 160.

### Phase 5: Schedule (Rebalanced DAG -> Scheduled Artifacts)
- **Entry Guard**: Input is cycle-free DAG.
- **Exit Criteria**: Annotated with critical path, anti-chains, and assigned lanes.

### Phase 6: Emit (Scheduled Artifacts -> Emitted Patch)
- **Entry Guard**: Input is scheduled DAG.
- **Exit Criteria**: Single PlanPatch v1.0 with operations[] array.
