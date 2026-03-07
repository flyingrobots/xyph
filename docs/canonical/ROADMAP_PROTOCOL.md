# ROADMAP PROTOCOL

## Task Lifecycle
- **BACKLOG**: Idea ingested, not yet estimated.
- **PLANNED**: Estimated, slotted into milestone.
- **IN_PROGRESS**: Claimed by a worker.
- **BLOCKED**: Blocked by an incomplete dependency.
- **DONE**: Acceptance criteria met, evidence attached.
- **GRAVEYARD**: Rejected or abandoned.

> **Note:** `INBOX` exists as a raw graph state for newly suggested tasks. It is normalized to `BACKLOG` on read. See `normalizeQuestStatus()` in `Quest.ts`.

![Task lifecycle](../diagrams/task-lifecycle.svg)

## Milestone Transitions
- **OPEN**: Accepting new tasks.
- **LOCKED**: No new scope without approval.
- **SHIPPED**: All mandatory features DONE.

![Milestone lifecycle](../diagrams/milestone-lifecycle.svg)
