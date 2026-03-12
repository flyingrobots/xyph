# ROADMAP PROTOCOL

## Task Lifecycle
- **BACKLOG**: Cheap triage only. Suggested work with provenance, not yet authorized.
- **PLANNED**: Authorized and shaped, but not yet executable.
- **READY**: Passed readiness validation and entered the executable work DAG.
- **IN_PROGRESS**: Claimed by a worker from `READY`.
- **BLOCKED**: Executable work blocked by an incomplete dependency.
- **DONE**: Acceptance criteria met, evidence attached.
- **GRAVEYARD**: Rejected or abandoned.

> **Note:** `normalizeQuestStatus()` in `Quest.ts` remaps legacy graph values on read: `INBOX` → `BACKLOG`. New code writes canonical status values directly.

## Readiness Rules
- A quest must be `PLANNED` before it can become `READY`.
- `READY` currently requires: a durable description, campaign assignment, and intent lineage.
- `claim` is valid only from `READY`.
- `PLANNED` quests may carry draft dependencies, estimates, and traceability links, but they are excluded from executable frontier / critical-path analysis.

![Task lifecycle](../diagrams/task-lifecycle.svg)

## Milestone Transitions
- **OPEN**: Accepting new tasks.
- **LOCKED**: No new scope without approval.
- **SHIPPED**: All mandatory features DONE.

![Milestone lifecycle](../diagrams/milestone-lifecycle.svg)
