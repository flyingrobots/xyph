# CLAUDE.md - XYPH Agent Participant Guide

## Quick Start
You're working on **XYPH** - a Causal Operating System for Agent Planning and Orchestration.

### Core Philosophy
- **The Graph is the State**: All coordination happens via a deterministic WARP graph.
- **Causal Agents**: Every participant is a first-class `Writer` with a cryptographic identity.
- **Stigmergy**: Coordinate by modifying the graph, not by direct messaging.
- **Optimistic Claiming**: Volunteer for tasks and verify success post-materialization.
- **Planning Compiler**: Transform roadmap intent into executable lanes via strict pipeline phases.

### Development Pattern
1. **Constitution First**: Every feature must obey the `CONSTITUTION.md`.
2. **Deterministic Writes**: All mutations must go through the `xyph-actuator`.
3. **Audit Everything**: Every decision must have a `rationale` and `confidence` score.
4. **Guild Aesthetic**: Use the "Digital Guild" terminology (Quests, Campaigns, Scrolls, Seals).

### Quality Gates
Before opening or updating a PR, **always** run the full test suite:
```bash
npm run build    # Verify TypeScript compilation
npm test         # Run full Docker-based test suite (900+ tests)
```
Never push code that doesn't pass both checks. CI failures waste time and break the review flow.

**NEVER circumvent quality checks:**
- ❌ NEVER use `--no-verify` to skip git hooks
- ❌ NEVER disable linter rules with `eslint-disable` comments
- ❌ NEVER use `@ts-ignore` or `@ts-expect-error` to silence TypeScript
- ❌ NEVER bypass tests or validation to "move faster"

Our duty is to write **safe, correct code**. Shortcuts that compromise quality are not acceptable.

**NEVER rewrite git history in any way:**
- ❌ NEVER amend commits (`--amend`)
- ❌ NEVER rebase
- ❌ NEVER force push (`--force`, `--force-with-lease`)
- ❌ NEVER squash

Every commit is permanent. If you made a mistake, fix it in a new commit.

**The TESTS are the SPEC:**
- ❌ NEVER change a test to make it pass
- ❌ NEVER skip tests
- ❌ NEVER use `--no-verify`
- ❌ NEVER disable or otherwise circumvent tests

If a test fails, the code is wrong — not the test. Fix the implementation.

**NEVER use loose types:**
- ❌ NEVER use `any` type
- ❌ NEVER use wildcard imports/types to dodge type safety
- ❌ NEVER cast to `any` or `unknown` to silence the compiler

If the types are hard, that means you need to understand the code better.

**Own every failure you see:**
- ❌ NEVER dismiss errors as "pre-existing" and move on. If you see something broken, fix it.
- ❌ NEVER say CI/CD failures are acceptable or ignorable. A red build is your problem now.
- If you encounter lint errors, test failures, or warnings — even ones that existed
  before your branch — fix them. You touched the codebase; you leave it better than
  you found it.

### Project Planning via the Actuator
XYPH plans and tracks its own development through the WARP graph.
The `xyph-actuator.ts` CLI is the single source of truth for what's been done,
what's next, and what's in the backlog.

- **See what's next**: `npx tsx xyph-actuator.ts status --view roadmap`
- **See everything**: `npx tsx xyph-actuator.ts status --view all`
- **Check the inbox**: `npx tsx xyph-actuator.ts status --view inbox`
- **Add a backlog item**: use `quest`, `inbox`, or `promote` commands
- **Plan work**: always consult the graph first — don't plan in your head, plan through the actuator

All project planning, prioritization, and progress tracking flows through the
actuator. If you want to know what to work on, ask the graph. If you want to add
work, write it to the graph.

### Command Reference
- `npx tsx xyph-actuator.ts status --view <roadmap|lineage|all|inbox|submissions|deps>`: View the roadmap state.
- `npx tsx xyph-actuator.ts quest <id> --title "Title" --campaign <id> --intent <id>`: Initialize a Quest.
- `npx tsx xyph-actuator.ts intent <id> --title "Title" --requested-by human.<name>`: Declare a sovereign Intent.
- `npx tsx xyph-actuator.ts claim <id>`: Volunteer for a task (OCP).
- `npx tsx xyph-actuator.ts submit <quest-id> --description "..."`:
  Submit quest for review (creates submission + patchset).
- `npx tsx xyph-actuator.ts revise <submission-id> --description "..."`:
  Push a new patchset superseding current tip.
- `npx tsx xyph-actuator.ts review <patchset-id> --verdict approve|request-changes|comment --comment "..."`:
  Review a patchset.
- `npx tsx xyph-actuator.ts merge <submission-id> --rationale "..."`: Merge (git settlement + auto-seal quest).
- `npx tsx xyph-actuator.ts close <submission-id> --rationale "..."`: Close submission without merging.
- `npx tsx xyph-actuator.ts seal <id> --artifact <hash> --rationale "..."`: Mark as DONE directly (solo work).
- `npx tsx xyph-actuator.ts inbox <id> --title "Title" --suggested-by <principal>`: Suggest a task for triage.
- `npx tsx xyph-actuator.ts promote <id> --intent <id>`: Promote INBOX → BACKLOG.
- `npx tsx xyph-actuator.ts reject <id> --rationale "..."`: Reject to GRAVEYARD.
- `npx tsx xyph-actuator.ts reopen <id>`: Reopen a GRAVEYARD task back to INBOX (human authority required).
- `npx tsx xyph-actuator.ts depend <from> <to>`: Declare that `<from>` depends on `<to>` (both must be `task:` nodes).
- `npx tsx xyph-actuator.ts audit-sovereignty`: Audit quests for missing intent lineage.
- `npx tsx xyph-actuator.ts generate-key`: Generate an Ed25519 Guild Seal keypair.

### git-warp: The Engine Under the Hood

XYPH is built on **git-warp** (v12.1.0) — a CRDT graph database that lives
inside a Git repository without touching the codebase. Every piece of graph
data is a Git commit pointing to the **empty tree** (`4b825dc6...`), making
it invisible to `git log`, `git diff`, and `git status`. The result: a full
graph database riding alongside your code, using Git as its storage and
transport layer.

#### Core Data Model
- **Nodes**: Vertices with string IDs (`task:BX-001`, `intent:sovereignty`)
- **Edges**: Directed, labeled relationships (`task:A --depends-on--> task:B`)
- **Properties**: Key-value pairs on nodes/edges, merged via **LWW** (Last-Writer-Wins)
- **Writers**: Independent causal agents, each with their own patch chain under `refs/warp/<graph>/writers/<writerId>`
- **Patches**: Atomic batches of operations stored as Git commits; each carries a **Lamport clock** tick

#### CRDT Merge Semantics
- **Nodes & Edges**: OR-Set — add wins over concurrent delete unless the delete observed the add
- **Properties**: LWW registers — highest Lamport timestamp wins; ties broken by writerId (lex), then patchSha
- **Deterministic convergence**: All writers always compute the same final state, regardless of patch arrival order

#### Materialization
Calling `graph.materialize()` replays all patches in strict Lamport order and
produces a deterministic `WarpStateV5` snapshot.
Checkpoints (`graph.createCheckpoint()`) allow incremental materialization —
only replay patches since the last checkpoint.

#### Mutation API
```typescript
// Convenience: create patch, run callback, commit — returns SHA
await graph.patch((p) => {
  p.addNode('task:X')
    .setProperty('task:X', 'title', 'Do the thing')
    .addEdge('task:X', 'task:Y', 'depends-on');
});

// Or: manual patch for CAS-protected multi-step mutations
const patch = await graph.createPatch();
patch.addNode('task:Z').setProperty('task:Z', 'status', 'PLANNED');
await patch.commit();
```

#### Query API
```typescript
// Simple lookups (auto-materialize)
await graph.getNodes();                          // string[]
await graph.hasNode('task:X');                   // boolean (MUST await!)
await graph.getNodeProps('task:X');              // Map<string, unknown> | null
await graph.neighbors('task:X', 'outgoing');    // adjacent nodes + edge labels

// Fluent QueryBuilder
const result = await graph.query()
  .match('task:*')
  .where({ status: 'PLANNED' })
  .outgoing('depends-on', { depth: [1, 3] })
  .select(['id', 'props'])
  .run();

// Aggregation
const stats = await graph.query()
  .match('task:*').where({ status: 'DONE' })
  .aggregate({ count: true, sum: 'props.hours' })
  .run();
```

#### Traversal API (`graph.traverse.*`)
```typescript
bfs(start, { dir, labelFilter })           // → string[]
dfs(start, { dir, maxDepth })              // → string[]
shortestPath(from, to, { dir })            // → { found, path, length }
weightedShortestPath(from, to, { weightFn }) // → { path, totalCost } (Dijkstra)
aStarSearch(from, to, { heuristicFn })     // → { path, totalCost, nodesExplored }
topologicalSort(start, { dir, labelFilter, throwOnCycle }) // → { sorted, hasCycle }
weightedLongestPath(from, to, { weightFn }) // → { path, totalCost } (critical path)
isReachable(from, to, { labelFilter })     // → { reachable }
connectedComponent(start, { maxDepth })    // → string[]
commonAncestors(nodes[], { maxDepth })     // → { ancestors }
```
- **`dir`**: `'out'` (default) | `'in'` | `'both'` — edge traversal direction
- **`labelFilter`**: string or string[] to restrict by edge label
- **Weight functions**: Use EITHER `weightFn` (edge) OR `nodeWeightFn` (node), never both

#### Subscriptions & Reactivity
```typescript
// Subscribe to ALL graph changes
const { unsubscribe } = graph.subscribe({
  onChange: (diff: StateDiffResult) => {
    // diff.nodes.added, diff.nodes.removed
    // diff.edges.added, diff.edges.removed
    // diff.props.set, diff.props.removed
  },
  onError: (err) => console.error(err),
  replay: true,  // fire immediately with current state
});

// Watch with pattern filtering + auto-polling for remote changes
const { unsubscribe } = graph.watch('task:*', {
  onChange: (diff) => { /* only task:* changes */ },
  poll: 5000,  // every 5s: hasFrontierChanged() → auto-materialize if changed
});
```
- **`StateDiffResult`**: Deterministic diff with added/removed nodes, edges, and property changes
- **`hasFrontierChanged()`**: O(writers) check — cheap way to detect remote writes without materializing
- **Subscriptions fire after `materialize()`** — they are pull-based, not push-based
- **Polling** (`poll` option): `setInterval` that calls `hasFrontierChanged()`, auto-materializes on change

#### Temporal Queries (CTL* Operators)
```typescript
// Was this node ALWAYS in 'active' status since tick 0?
await graph.temporal.always('task:X', (snap) => snap.props.status === 'active', { since: 0 });

// Did this task EVER reach 'DONE'?
await graph.temporal.eventually('task:X', (snap) => snap.props.status === 'DONE');
```

#### Observer Views (Filtered Projections)
```typescript
const view = await graph.observer('dashboard', {
  match: 'task:*',
  expose: ['title', 'status', 'hours'],
  redact: ['internal_notes'],
});
// Read-only, property-filtered view with full query/traverse API
```

#### Other Capabilities
- **Provenance**: `graph.patchesFor('task:X')` — which patches touched a node
- **Slicing**: `graph.materializeSlice('task:X')` — materialize only the causal cone for one node
- **Fork**: `graph.fork({ from, at, forkName })` — branch from a point in history
- **Sync**: `graph.syncWith(url)` or `graph.syncWith(otherGraph)` — multi-writer sync via Git transport or HTTP
- **GC**: `graph.runGC()` / `graph.maybeRunGC()` — compaction of tombstones
- **Content**: `patch.attachContent(nodeId, blob)` / `graph.getContent(nodeId)` — content-addressed blobs

### Remember
- You are a **Causal Agent**. Your actions are permanent, signed, and time-travelable.
- "Work finds its way like water flowing downhill."
- Trust is derived from the mathematical convergence of the graph.

**Squad up. Join the guild. Ship the future.**
