# ROADMAP PROTOCOL

## Task Lifecycle
- **BACKLOG**: Idea ingested, not yet estimated.
- **PLANNED**: Estimated, slotted into milestone.
- **IN_PROGRESS**: Claimed by a worker.
- **BLOCKED**: Blocked by an incomplete dependency.
- **DONE**: Acceptance criteria met, evidence attached.

```mermaid
stateDiagram-v2
    direction LR
    [*] --> BACKLOG
    BACKLOG --> PLANNED
    BACKLOG --> GRAVEYARD
    PLANNED --> IN_PROGRESS
    PLANNED --> GRAVEYARD
    IN_PROGRESS --> BLOCKED
    IN_PROGRESS --> DONE
    BLOCKED --> IN_PROGRESS
    GRAVEYARD --> BACKLOG
```

## Milestone Transitions
- **OPEN**: Accepting new tasks.
- **LOCKED**: No new scope without approval.
- **SHIPPED**: All mandatory features DONE.

```mermaid
stateDiagram-v2
    direction LR
    [*] --> OPEN
    OPEN --> LOCKED
    LOCKED --> SHIPPED
```
