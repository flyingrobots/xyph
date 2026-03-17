# XYPH As A WARP App

## Thesis

XYPH is one of the first applications that feels genuinely **native to WARP**
rather than merely built on top of it.

It is not “a planner that happens to use a graph.”
It is not “a workflow tool that stores tickets in Git.”
It is not “a CRDT demo with a UI.”

XYPH works because git-warp makes a specific combination possible:

- a **multi-writer graph**
- stored directly in **Git**
- with **deterministic convergence**
- **offline-first** and asynchronous by default
- with **history, receipts, and provenance** available as runtime primitives
- now with **working sets** that support pinned coordinates and speculative
  continuation without worktree churn

That combination is what lets XYPH treat the graph itself as the executable
plan, not as a cache behind a server.

## What XYPH Is

XYPH is a planning compiler and collaboration engine for humans and agents.

Humans declare intent and constitutional authority. Agents and humans then
coordinate by reading and writing the same graph. The graph holds:

- intents
- campaigns
- quests
- requirements
- criteria
- evidence
- submissions
- reviews
- decisions
- comments
- proposals
- attestations

This is not just storage. It is the **shared environment of work**.

In XYPH, stigmergy is the operating model:

- no central orchestrator telling everyone what to do next
- no ticket queue as the canonical truth
- no server process that owns reality

Instead:

- the graph is the plan
- the graph is the coordination medium
- the graph is the historical record

## Why git-warp Is The Right Substrate

Most stacks force a tradeoff:

- databases give queryability, but not offline-first Git-native replication
- Git gives history, but not a first-class multi-writer graph with deterministic
  CRDT semantics
- CRDT systems give convergence, but often not auditable Git transport,
  patch-level provenance, or durable integration into ordinary repositories

git-warp is unusual because it combines all of those in one substrate.

### 1. The graph lives in Git without becoming your worktree

git-warp stores graph history in Git refs under `refs/warp/...`, not as normal
source files in the working tree.

That means XYPH gets:

- Git replication
- Git durability
- Git-hosted history
- Git-native transport

without turning the app into “a bunch of JSON files committed to main.”

For XYPH, that is crucial. The graph can evolve independently of the codebase
while still traveling with the repository.

### 2. Multi-writer collaboration without a coordinator

Each writer in git-warp maintains its own patch chain. Materialization merges
those chains deterministically using CRDT rules and Lamport ordering.

That means XYPH can let:

- humans
- agents
- services
- offline peers

all write concurrently without inventing a central lock manager or a server
that serializes all action.

This is not an implementation detail. It is what makes XYPH’s stigmergic model
credible.

### 3. History is not an afterthought

git-warp does not only give “current state.”
It gives:

- causal patches
- receipts
- replayable coordinates
- provenance
- deterministic historical materialization

That lets XYPH ask questions that ordinary workflow apps usually cannot answer
cleanly:

- what changed here?
- who actually settled this?
- what evidence justified this state?
- what was visible at that earlier coordinate?
- what conflicts were present at the time?

### 4. Working sets make worldlines practical

Git branches and worktrees are the wrong primitive for XYPH’s worldline model.
They assume filesystem materialization is primary.

XYPH needs something else:

- fork from an observation
- continue speculatively
- avoid contaminating shared plan truth
- keep materialization as cache, not authority

git-warp working sets provide exactly that:

- a pinned base observation
- a durable overlay patch log
- replayable materialization
- no worktree churn

That is why `fork_worldline` in XYPH is a thin mapping onto git-warp working
sets rather than a reinvention of branching.

## What WARP Enables In XYPH That Ordinary Tools Do Not

The differentiator is not one isolated feature. It is the whole stack working
together.

### The plan is executable shared state

In conventional tooling:

- a ticket system stores intent
- Git stores code
- CI stores verification
- chat stores coordination
- a database stores app truth

Each layer sees only part of the story.

In XYPH, the graph can represent:

- planned work
- dependency structure
- execution state
- review state
- evidence
- settlement

inside one causal substrate.

That is a different kind of application architecture.

### Agents can collaborate without a message bus being the source of truth

An agent does not need to wait for an orchestrator to assign work if the graph
already exposes:

- what exists
- what is blocked
- what is reviewable
- what is missing evidence
- what changed recently

This is what “stigmergic” means in practice. The environment itself becomes the
coordination mechanism.

git-warp makes that environment safe to share across concurrent writers.

### Speculative execution becomes first-class

Without working sets, an autonomous agent has two bad choices:

- mutate shared truth too early
- or stay trapped in non-executable suggestion mode

With git-warp working sets, XYPH can support a third mode:

- fork a worldline
- execute a speculative sequence locally
- inspect history, diff, and conflicts there
- later collapse or discard it

That is a real capability increase, not just a nicer abstraction.

### Time travel is operational, not decorative

Because git-warp exposes replayable coordinates, receipts, provenance, conflict
analysis, and now working sets, XYPH can build a true time-travel surface.

Not a cosmetic history viewer.

A real one that can answer:

- what did reality look like here?
- what changed between these coordinates?
- what conflicting alternatives existed?
- what would the plan look like if we continued from there?

That is why XYPH’s future “AION” / Time Travel surface is plausible.

## Why Worldlines Matter In A Stigmergic System

This is the most important conceptual point.

If the graph is the shared plan, then mutating the live graph is not a private
edit. It changes the coordination field that everybody else reacts to.

That means speculative, structural, or high-blast-radius edits need somewhere
to live before they become settled communal truth.

That is what worldlines are for.

Use `worldline:live` for:

- normal execution
- routine status/evidence updates
- ordinary collaboration

Use a derived worldline for:

- structural replanning
- risky “what if” execution
- coherent multi-step speculative change
- review lanes
- offline continuation from a pinned observation

So worldlines do not replace stigmergy. They protect it by keeping the live
signal clean.

## A Concrete Example

Imagine an agent wants to refactor a campaign plan:

1. Split one quest into five.
2. Move dependencies.
3. Reassign ownership.
4. Change readiness conditions.
5. Attach new evidence requirements.

If that lands directly in the live graph one mutation at a time, every other
human and agent starts reacting to an incoherent intermediate state.

With XYPH on git-warp:

1. The agent forks a worldline backed by a git-warp working set.
2. It applies the whole speculative sequence in that overlay.
3. It inspects `history`, `diff`, and `observe(conflicts)` there.
4. Humans or other agents review the candidate future.
5. The change can later be accepted, compared, collapsed, or discarded.

That workflow depends on git-warp’s substrate features being real:

- durable multi-writer patch history
- replayable coordinates
- overlay patch logs
- deterministic read models
- conflict analysis tied to causal evidence

Without those, “worldlines” would just be branding.

## Why This Is A Good Showcase For git-warp

XYPH demonstrates that git-warp is not just a novel storage engine.
It is a substrate for a different category of application:

- offline-first
- multi-writer
- history-native
- provenance-native
- forkable without worktrees
- auditable without centralization

XYPH is a good WARP app because it uses those properties directly instead of
flattening them back into a conventional server/database/workflow shape.

The pitch is not:

> “Here is a planner that happens to use git-warp.”

The stronger pitch is:

> “Here is a planning and collaboration system whose core behavior only makes
> sense because git-warp exists.”

## Short Version For A Hype Page

XYPH treats the graph as the plan, not as a cache. Humans and agents
coordinate stigmergically by reading and writing a shared WARP graph stored
inside Git. Because git-warp provides multi-writer CRDT convergence,
provenance-bearing history, replayable coordinates, and working sets for
speculative continuation, XYPH can support executable worldlines, time-travel
inspection, and offline-first collaboration without a server. That is what
makes it a real WARP app rather than a generic planner with a graph backend.
