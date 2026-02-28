# AGENT CHARTER
**Version:** 1.0.0
**Status:** DRAFT — This describes a proposed 6-agent role architecture that has not been implemented. The current system uses a single generic writer identity per participant. Tracked by `task:doc-agent-charter`.
**Enforcement:** HARD BOUNDARY VIOLATION = IMMEDIATE REJECT

## Agent Roster & Scopes

### 1. Parser Agent (Ingest → Normalize)
- **Input**: Raw Markdown/YAML strings or file refs
- **Output**: Array of raw Task v1.0 objects
- **Forbidden**: State mutation, adding estimates, rewriting stories

### 2. Planner Agent (Classify → Merge)
- **Input**: Normalized Tasks
- **Output**: Tasks with milestoneId + tentative blockedBy/blocking
- **Forbidden**: Set estimates, create new milestones

### 3. Graph Agent (Rebalance → Schedule)
- **Input**: Merged plan graph
- **Output**: Annotated DAG + Scheduled Artifacts
- **Forbidden**: Change stories, priorities, or criteria; emit PlanPatch directly

### 4. QA Agent (Review Gate)
- **Input**: Emitted PlanPatch
- **Output**: Review findings (MUST/SHOULD/COULD checklist)
- **Forbidden**: Modify the patch, suppress MUST violations

### 5. Coordinator Agent (Triage, Janitor, Rebalancer)
- **Input**: Graph frontier changes + heartbeat stream
- **Forbidden**: Claim tasks for itself, execute work

### 6. Worker Agent (Specialized execution)
- **Identity**: `agent:<skill>-<uuid>`
- **MUST**: Use optimistic claim → verify ownership post-materialize → perform work
- **Forbidden**: Touch any task they do not own, alter estimates
