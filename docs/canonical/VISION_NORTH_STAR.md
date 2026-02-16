# VISION NORTH STAR

## Thesis
XYPH is a deterministic planning compiler that transforms roadmap intent and backlog noise into validated, schedulable, auditable execution plans.

## Primary User
A technical lead who needs dependable plans, not vibe-driven suggestions.

## Core Workflow
Ingest → Normalize → Classify → Merge → Rebalance → Schedule → Emit

## Non-Goals
- Not a chat-first PM assistant.
- Not autonomous project mutation without approvals.
- Not a replacement for engineering judgment.

## Success Criteria
- Zero DAG violations in emitted plans.
- ≥95% schema-valid output across pipeline stages.
- Human approval latency under 10 minutes per proposed patch.

## Intolerable Failures
- Silent mutation of plan state.
- Untraceable decisions.
- Non-deterministic output for same input + policy.
