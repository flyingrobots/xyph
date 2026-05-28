# 0027: Session Entity

## Cycle Type

Feature delivery cycle

## Status

Design — not yet branched.

## Graph Anchor

- Work item: `task:session-entity`
- Legend: AGENT (agentic bedrock)

## Why This Cycle Exists

Every agent invocation reads nodes, writes patches, and exits. There is
currently no durable record of why those reads happened, which nodes were
consulted, or what session introduced a given mutation. The graph accumulates
facts but loses authorship context over time.

Two failure modes this creates:

1. **Lost provenance.** A task node exists. There is no way to ask "which agent
   interaction created this, and what did it read before deciding to create it?"
2. **No submission seam.** Agents currently write to the graph directly through
   CLI commands invoked in-process. There is no staging layer — no place to
   assemble a batch of work, validate it as a unit, and commit it atomically.

This cycle introduces `session:*` and `command:*` as first-class graph
entities. A session is a named causal lane — the graph-level record of a single
agent (or human) interaction. Commands are typed pending operations attached to
a session before admission. When the session commits, a `CommandProcessor`
dispatches each command through the same domain handlers the CLI uses, writes
results back to the command nodes, and returns provenance receipts. The session
is permanently visible in the graph after close.

This design is explicitly aligned with git-warp v18's `WarpWorldline` model.
A session maps directly to a named worldline with a single `writerId`. When
xyph upgrades to v18, `WarpSessionAdapter` will swap `graph.patch()` for
`worldline.commit()` and the returned receipts will become real
`TickReceipt` provenance witnesses. The domain model does not change.

## Sponsor Actors

### Primary sponsor actor

**Working Agent**

Needs to open a named session before beginning work, stage commands against it,
commit the session, and receive node IDs it can use to track downstream
outcomes. Needs the permanent session record to be queryable: "what did
agent.claude do on 2026-05-28?" must be answerable from the graph alone.

### Secondary sponsor actor

**Operator-Supervisor**

Needs to audit agent activity after the fact. "Which session introduced
task:session-entity?" and "what did the agent read before deciding to create
it?" must be graph queries, not guesswork. Needs `session list`, `session show`,
and the `causes` edge trail to reconstruct any session's causal footprint.

## Outcome Hill

**As an agent or supervisor, I can open a named session, attach typed commands
to it, commit the session synchronously to receive result IDs, and later
reconstruct the full causal context of that interaction from the graph alone —
without any external log.**

## Invariants

This cycle must preserve:

- The graph is the plan — sessions and commands are graph nodes, not a
  parallel store. No external database, no log files.
- CRDT integrity — session and command nodes are append-only. Status
  transitions are prop updates via `graph.patch()`, never deletions.
- Existing CLI commands continue to work unchanged. The session path is
  additive, not a replacement.
- Domain validation still runs for every command. The session is a submission
  seam, not a validation bypass.
- The `agent.prime` fallback writerId applies when no agentId is specified.
- `operational` snapshot profile excludes session and command nodes. They
  appear only in `audit` and `full` profiles.

## Schema Additions (`src/schema.ts`)

**New prefixes (2):**
- `'session'` — a named agent interaction record
- `'command'` — a typed pending operation within a session

**New edge types (1):**
- `'authored'` — `session:X → node:Y` shortcut asserting "this session
  produced this node." Complements the `command:X --[causes]--> node:Y` trail
  for direct session-level provenance queries.

**Existing edge types reused:**
- `'contains'` — `session:X → command:Y` (already in EDGE_TYPES)
- `'causes'` — `command:X → result:Y` (already in EDGE_TYPES)

## Node Shapes

### `session:*`

```
id:          session:<unix-ms>-<8-hex>
agentId:     string               e.g. "agent.claude"
purpose:     string               ≥ 5 chars
status:      "open" | "committed" | "failed"
startedAt:   number               unix ms
committedAt: number | undefined   set on commit
```

### `command:*`

```
id:          command:<unix-ms>-<8-hex>
sessionId:   string               denormalized for lookup
type:        string               e.g. "quest.add", "depend", "quest.close"
params:      Record<string,unknown>
status:      "pending" | "admitted" | "failed"
ordinal:     number               execution order within session
resultNodeId: string | undefined  set on admission
errorMessage: string | undefined  set on failure
```

## New Files

| File | Role |
| :--- | :--- |
| `src/domain/entities/Session.ts` | Session domain entity + validation |
| `src/domain/entities/Command.ts` | Command domain entity + validation |
| `src/ports/SessionPort.ts` | Write-side port: open / attach / commit |
| `src/domain/services/CommandProcessor.ts` | Handler registry + admission loop |
| `src/infrastructure/adapters/WarpSessionAdapter.ts` | Graph-backed SessionPort impl |
| `src/cli/commands/session.ts` | CLI surface: open / add / commit / await / list / show |

## CLI Surface

| Command | Description |
| :--- | :--- |
| `session open --purpose "..."` | Create a new open session, print its ID |
| `session add <type> [params...]` | Attach a pending command to the current session |
| `session commit <id>` | Admit all pending commands; returns `[{ commandId, nodeId }]` |
| `session await <nodeId>` | Poll until node reaches a terminal state or timeout |
| `session list [--agent <id>] [--status open\|committed\|failed]` | List sessions |
| `session show <id>` | Show session detail, attached commands, and result nodes |

`session add` accepts the same argument shapes as the corresponding direct CLI
commands. The params are stored as `command.params` and dispatched through the
identical handler at commit time.

## `CommandProcessor` Design

The processor lives in the domain layer and knows nothing about git-warp
directly. It receives a `SessionPort` for reads and a handler registry for
dispatch.

```
HandlerRegistry: Map<string, CommandHandler>

CommandHandler = (params: Record<string, unknown>) => Promise<{ nodeId: string }>
```

Registered handlers at startup (in `xyph-actuator.ts`):

```
registry.register('quest.add',   questAddHandler)
registry.register('quest.close', questCloseHandler)
registry.register('depend',      dependHandler)
registry.register('intent.add',  intentAddHandler)
// ... one entry per mutable CLI command
```

Admission loop:

```
1. Load session node — assert status === 'open'
2. Load all [contains] command nodes, sort by ordinal
3. For each command:
     handler = registry.get(command.type)  // fail fast if unknown type
     result  = await handler(command.params)
     patch:  command.status = 'admitted', command.resultNodeId = result.nodeId
     patch:  session --[authored]--> result.nodeId
             command --[causes]--> result.nodeId
4. patch: session.status = 'committed', session.committedAt = now
5. Return receipts: [{ commandId, nodeId, status }]
```

On any handler failure: mark that command `failed` with `errorMessage`, mark
session `failed`, stop processing, return partial receipts with the failure.

## v18 Upgrade Path

The `WarpSessionAdapter` is the only file that changes on v18 upgrade:

| v17 | v18 |
| :--- | :--- |
| `graph.patch(build)` per command | `worldline.commit(patch => { ... })` per session |
| No receipt | `TickReceipt` stored as `session.receiptSha` |
| Ad-hoc writerId threading | `openWarpWorldline({ worldlineName: sessionId, writerId: agentId })` |

The domain layer (`Session.ts`, `Command.ts`, `CommandProcessor.ts`,
`SessionPort.ts`) is untouched by the v18 upgrade.

## Acceptance-Test Plan

### Checkpoint 1: Session entity validation

1. Valid session props construct without error.
2. `id` not starting with `session:` throws `SessionValidationError`.
3. `purpose` shorter than 5 chars throws `SessionValidationError`.
4. `agentId` empty string throws `SessionValidationError`.

### Checkpoint 2: Command entity validation

5. Valid command props construct without error.
6. `type` empty string throws `CommandValidationError`.
7. `ordinal` negative throws `CommandValidationError`.

### Checkpoint 3: Session open / list / show

8. `session open` creates a `session:*` node with `status: 'open'`.
9. `session list` returns all sessions for a given agentId.
10. `session show` returns session detail including attached command nodes.

### Checkpoint 4: Command attachment

11. `session add quest.add title="Foo"` creates a `command:*` node linked via
    `contains` with `status: 'pending'`.
12. Multiple `session add` calls increment `ordinal` sequentially.

### Checkpoint 5: Commit — happy path

13. `session commit` dispatches all pending commands in ordinal order.
14. Each admitted command has `status: 'admitted'` and a `resultNodeId`.
15. Session transitions to `status: 'committed'` with `committedAt` set.
16. `command --[causes]--> resultNode` edges exist after commit.
17. `session --[authored]--> resultNode` edges exist after commit.

### Checkpoint 6: Commit — failure path

18. Unknown command type fails fast with `CommandValidationError` before any
    mutations.
19. Handler failure marks the command `failed`, marks session `failed`, and
    stops processing.
20. Commands before the failure point remain `admitted`; commands after remain
    `pending`.

### Checkpoint 7: Session await

21. `session await <nodeId>` resolves when the node reaches a known terminal
    state.
22. `session await <nodeId> --timeout 0` returns immediately with current
    status.

### Checkpoint 8: Snapshot profiles

23. `fetchSnapshot('operational')` excludes session and command nodes.
24. `fetchSnapshot('audit')` includes session and command nodes.
25. `fetchSnapshot('full')` includes session and command nodes.

## Implementation Notes

- ID generation: `${prefix}:${Date.now().toString(10)}-${crypto.randomBytes(4).toString('hex')}`
  — unix-ms timestamp prefix for natural chronological sort, 8-hex suffix for
  uniqueness. Consistent with other entity ID patterns in the codebase.

- The `CommandProcessor` does not hold a reference to `WarpSessionAdapter`.
  It receives a `SessionPort` interface — adapter is injected at the
  composition root in `xyph-actuator.ts`. This preserves the hexagonal
  boundary.

- Handler registration happens at actuator startup, not inside the processor.
  The processor is pure domain logic; it does not import adapter code.

- `session await` in v17 is a polling loop with configurable interval and
  timeout, watching `getNodeProps(nodeId)` for status transitions. In v18 this
  becomes a `worldline.coordinate().optic()` coherent watch.

- For the `operational` snapshot filter: add `session:` and `command:` prefix
  checks to the existing `filterGraphSnapshot()` exclusion list.

## Playback Questions

1. Can I open a session, add two commands, commit it, and immediately query
   the resulting nodes from the graph — without any other CLI invocations?
2. Does `session list --agent agent.claude` show my session after commit?
3. Does `session show <id>` show the commands, their result node IDs, and the
   `causes` edge trail?
4. If one command fails, does the session correctly record partial state — some
   admitted, one failed — rather than silently swallowing the error?
5. Does `fetchSnapshot('operational')` stay clean (no session/command nodes
   polluting the quest list)?

## Exit Criteria

This cycle closes when:

- All 25 acceptance tests pass
- Live smoke tests demonstrate the full commit cycle (open → add → commit →
  show) against the live `xyph` graph
- `fetchSnapshot('operational')` confirmed clean in a live smoke test
- CHANGELOG and CLAUDE.md command reference updated
- Playback witness recorded
- Retro written
