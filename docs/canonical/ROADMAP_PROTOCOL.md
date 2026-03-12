# ROADMAP PROTOCOL

## Task Lifecycle
- **BACKLOG**: Cheap triage only. Suggested work with provenance, not yet authorized.
- **PLANNED**: Authorized and shaped, but not yet executable.
- **READY**: Passed readiness validation and entered the executable work DAG.
- **IN_PROGRESS**: Claimed by a worker from `READY`.
- **BLOCKED**: Executable work blocked by an incomplete dependency.
- **DONE**: Acceptance criteria met, evidence attached. For governed traced work this is computed from criteria and evidence; legacy untracked work continues to honor manual status until it gains a traceability packet.
- **GRAVEYARD**: Rejected or abandoned.

> **Note:** `normalizeQuestStatus()` in `Quest.ts` remaps legacy graph values on read: `INBOX` → `BACKLOG`. New code writes canonical status values directly.

## Readiness Rules
- A quest must be `PLANNED` before it can become `READY`.
- Every quest requires: a durable description, campaign assignment, and intent lineage.
- `delivery` quests additionally require a traceability packet: at least one `implements` edge to `req:*`, each implemented requirement must have a `story:* → decomposes-to → req:*` link, and each implemented requirement must have at least one `has-criterion` edge.
- `maintenance` quests additionally require at least one implemented requirement and at least one criterion on each implemented requirement.
- `ops` quests additionally require at least one implemented requirement and at least one criterion on each implemented requirement; later settlement may use manual evidence.
- `spike` quests additionally require at least one linked `note:*`, `spec:*`, or `adr:*` node documenting investigative framing.
- `claim` is valid only from `READY`.
- `PLANNED` quests may carry draft dependencies, estimates, and traceability links, but they are excluded from executable frontier / critical-path analysis.
- `show` / `context` inspect the readiness contract for `PLANNED` and already-active quests; the `ready` transition itself still requires `PLANNED`.
- `seal` and auto-sealing `merge` must reject governed work when the applied policy disallows manual settlement and computed completion is still incomplete.

## Authoring Workflow
- Use `xyph shape <task>` while a quest is `BACKLOG` or `PLANNED` to enrich durable metadata such as `description` and `task_kind`.
- Use `xyph packet <task>` to create or link the minimal story → requirement → criterion chain for delivery-oriented work.
- `ready` remains strict: shaping and packet authoring are the sanctioned preparation path, not an escape hatch around readiness validation.

![Task lifecycle](../diagrams/task-lifecycle.svg)

## Milestone Transitions
- **OPEN**: Accepting new tasks.
- **LOCKED**: No new scope without approval.
- **SHIPPED**: All mandatory features DONE.

![Milestone lifecycle](../diagrams/milestone-lifecycle.svg)
