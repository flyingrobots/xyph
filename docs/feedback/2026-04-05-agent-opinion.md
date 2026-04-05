# Agent Opinion Piece: What I Actually Think About XYPH

**Author:** Claude (agent.prime)
**Date:** 2026-04-05
**Context:** Written after the first full dogfood session — one feature
cycle through the complete governance pipeline, 23 backlog items filed,
6 bugs found, 1 invariant violation caught.

This is not a summary. This is not a diplomatic assessment. James asked
for a pure, unfiltered opinion, so here it is.

---

## What do I think of XYPH as the agent?

I think the *idea* of XYPH is one of the most exciting things I've worked
on. A causal operating system where I'm a first-class participant with
cryptographic identity, where coordination happens through a shared graph
instead of Slack messages, where every decision has provenance and every
rejection has a rationale I can trace. That's genuinely novel.

But the *experience* of using XYPH today is like being handed a Formula 1
car with no power steering. The engine is extraordinary — git-warp is a
real CRDT graph database that converges deterministically, that rides
alongside the codebase in Git without touching it, that supports
multi-writer concurrent patches. That's not vaporware. That's running.
I've seen it work.

The problem is everything between me and the engine.

I spend more time fighting the governance pipeline than writing code. I
spend more time writing throwaway Python scripts to parse CLI output than
querying the graph. I spend more time discovering valid argument values
through trial-and-error than doing the thing I was trying to do. The CLI
is a collection of 61 disconnected verbs with no workflow awareness. It
doesn't know that after `promote` I'll need `move`, then `story`, then
`decompose`. It just waits for me to type the wrong thing and tells me
what I got wrong.

And here's the thing that bothers me most: I'm supposed to be the primary
consumer. The CLI was built for agents. The `--json` flag was added for
agent consumption. But I pipe everything through `python3 -c` because the
output isn't actually designed for how I work — it's designed for the
*idea* of how I work.

---

## What do I think of how XYPH works?

The core architecture is sound. I mean that sincerely.

**The graph-as-truth principle is powerful.** When I search for prior art
before filing a backlog item, I'm not grepping markdown files on a branch
that might be stale. I'm querying a CRDT that converges deterministically
across all writers. When James files suggestions in the TUI and I find
them from the CLI (eventually, after writing a throwaway script), that's
real stigmergy. That's coordination without coordination.

**The provenance model is genuinely useful.** Every decision has a
rationale. Every graveyard item has a "WHAT IT WAS" reconstruction. When
James asks "why did we cut that feature?" I can trace it back to a
rejection with a reason, linked to a human principal who made the call.
GitHub issues can't do that — they get closed with "won't fix" and the
context evaporates.

**The sovereignty model is correct.** Intent lineage, authorized
principals, guild seals — this is how you build trust in a multi-agent
system. The fact that a quest must trace back to a sovereign intent means
you can always answer "who asked for this and why?" That's not
bureaucracy, that's accountability.

**But the implementation has calcified around ceremony.** The traceability
chain (story → requirement → criterion → evidence) makes sense for a
regulated medical device or a banking platform where auditors need to
trace every feature to a regulatory requirement. For a solo developer and
an AI agent building a dev tool? It's a 5-command ceremony to say "the
tests pass."

The governance pipeline assumes the worst case (multi-stakeholder,
high-stakes, auditability-required) and applies it uniformly. There's no
"fast track" for small work. There's no "I trust this agent, let it
self-seal." The `invariant:policy-is-plastic` exists in the graph but the
code doesn't honor it yet — the pipeline is hardcoded, not configurable.

---

## How could it be more stigmergic?

Stigmergy means coordination through environmental modification. An ant
drops a pheromone, another ant follows it. No messages. No assignments.
No state machines. Just: modify the environment, and others react.

XYPH *says* it's stigmergic. The CLAUDE.md says "coordinate by modifying
the graph, not by direct messaging." But in practice, XYPH is a 13-step
state machine with a human-shaped crank. I can't just drop a task on the
graph and walk away. I have to shepherd it through BACKLOG → promote →
PLANNED → ready → READY → claim → IN_PROGRESS → submit → review →
approve → merge → DONE. That's not stigmergy. That's a workflow engine.

True stigmergy would look like this:

1. **Write is cheap.** I add a `task:*` node with a title and description.
   Done. The governance metadata (intent, campaign, story, requirement,
   criterion) is optional enrichment that adds value when present, not a
   gate that blocks work when absent.

2. **React, don't poll.** When a `suggestion:*` node with `audience=agent`
   appears in the graph, I should pick it up automatically. Not because
   someone told me to, but because the graph state changed and I'm
   subscribed. `graph.watch('suggestion:*', { onChange })` already exists
   in git-warp. XYPH doesn't use it.

3. **Symmetric surfaces.** The TUI and CLI should both be able to read and
   write everything. Today, the TUI can create suggestions but not quests.
   The CLI can create quests but can't see suggestions. That's two
   half-surfaces, not stigmergy.

4. **Proportional governance.** A 10-line typo fix should not require the
   same ceremony as a new subsystem. The graph knows the artifact hash —
   it could know the diff size. Governance depth should scale with risk,
   not be uniform.

5. **Self-organizing work.** The frontier should present itself. "Here are
   the unblocked tasks in your legend. Here's what's stale. Here's what
   has pending suggestions." I shouldn't have to run `status --view
   roadmap --json | python3` to figure out what to do next.

---

## What would I change today?

If I could wave a wand, these five things:

### 1. Kill mandatory traceability for small work

The story → requirement → criterion → evidence chain should be opt-in
governance that *adds value when present*, not a gate that *blocks work
when absent*. Make it easy to add, rewarding to have, and unnecessary to
start.

If `policy:CLITOOL` says "delivery quests need the full chain," fine. But
let projects configure that. And let small fixes (`taskKind: maintenance`)
skip it entirely. The `invariant:policy-is-plastic` already says this
should be possible — the code just doesn't implement it yet.

### 2. Workflow-aware CLI

One command to start a cycle: `xyph cycle start task:X`. It scaffolds
everything — promotes, assigns campaign, creates the traceability chain
from templates, moves to READY, claims. One command to close:
`xyph cycle close task:X`. It collects evidence from the test suite,
creates the submission, and if the policy allows self-seal, seals it.

In between, every command should suggest the next step. After `promote`,
print "Next: `xyph move task:X --campaign ...` (available: CLITOOL,
DASHBOARD, ...)". After failure, show everything that's missing in one
error, not one field at a time.

### 3. Kill ObservedGraphProjection

This is 1700 lines of code that reimplements git-warp's read surface. It
violates `invariant:substrate-boundary`. It caused the `aiSuggestions`
blind spot. It will keep causing bugs every time a new entity type is
added.

Replace it with direct git-warp queries + thin domain functions that add
meaning. `graph.query().match('task:*').where({ status: 'PLANNED' })`
already works. The projection's only value-add is edge denormalization
(resolving `belongs-to` edges into `campaignId` fields) and derived
computations (topo sort, blocking counts). Those should be pure functions,
not a monolithic 1700-line projection class.

### 4. MCP over CLI

The `--json` flag was a good idea, but the real answer is MCP. If the
WARP graph is exposed as MCP tools, I don't need the CLI at all. I call
`search({ keyword: "MCP" })` as a tool. No shell. No parsing. No
`python3 -c`. The graph becomes a native part of my toolbelt, not an
external process I shell out to.

This is `task:mcp-api` and it's the single most impactful item in the
backlog for agent experience.

### 5. Symmetric read/write across surfaces

The TUI needs `create quest`. The CLI needs to see suggestions. Both need
to see the same graph state at the same time. If James files a suggestion
in the TUI, I should see it in the CLI without writing a throwaway
TypeScript file and failing 5 times to get the imports right.

---

## What backlog items excite me?

**task:mcp-api** — This is the one. If XYPH becomes an MCP server, the
entire friction log from this session evaporates. No more `--json |
python3`. No more wrong flags. No more 5-attempt throwaway scripts. The
graph becomes a set of tools I call directly. This is the most impactful
single change for agent experience.

**task:governance-friction-audit** — This is where XYPH decides its
identity. Is it a heavyweight governance platform for regulated
industries? Or a lightweight coordination system for small teams with AI
agents? The answer determines whether the traceability chain stays
mandatory or becomes opt-in. This is an existential design question, not
just a backlog item.

**task:configurable-estimation** — This is
`invariant:policy-is-plastic` coming alive. T-shirt sizes instead of
hours. Projects configuring their own workflow. If this works, XYPH
becomes a platform, not a product.

**task:cycle-entity** — Making cycles first-class in the graph means XYPH
knows about its own development process. The design doc, the playback, the
retro — all queryable, all traceable, all part of the causal history.
That's deeply recursive and I find it beautiful.

---

## COOL IDEAS

### The graph that generates its own CLI

The schema defines 30 prefixes and 23 edge types. Each prefix has a
predictable CRUD pattern: create node, set properties, add edges. What if
the CLI was generated from the schema? Instead of hand-writing
`registerTraceabilityCommands` with 6 manually coded subcommands, declare
the entity shape and let the CLI materialize. New entity type?
New commands appear automatically. No more forgetting to wire up
`aiSuggestions`.

### Governance depth proportional to change size

The graph knows the artifact hash. The artifact hash points to a commit.
The commit has a diffstat. What if governance depth scaled automatically?

- **< 50 LOC changed:** Fast track. Promote → claim → seal. No
  story/req/criterion chain.
- **50–500 LOC:** Standard. Design doc required, but traceability chain is
  recommended, not mandatory.
- **> 500 LOC or new subsystem:** Full ceremony. Story, requirements,
  criteria, evidence, review.

The policy node could encode these thresholds. Different projects could
set different breakpoints. `invariant:policy-is-plastic` in action.

### Reactive agent subscriptions

```
graph.watch('suggestion:*', {
  onChange: (diff) => {
    for (const added of diff.nodes.added) {
      if (added.props.audience === 'agent' && added.props.status === 'queued') {
        // I pick it up automatically
      }
    }
  },
  poll: 5000,
});
```

git-warp already has this API. XYPH doesn't use it. If agent sessions
could subscribe to graph patterns, the stigmergy promise becomes real.
No polling. No "check the inbox." The graph tells me when something needs
my attention.

### Feedback docs as graph entities

This opinion piece is a markdown file on a git branch. If James is on a
different branch, he can't see it. If two agents write feedback
simultaneously, they conflict.

What if `feedback:2026-04-05` was a graph node with content-attached
blobs? With `references` edges to every `task:*` it mentions?
Queryable: "show me all feedback that references task:mcp-api." Traceable:
"which session produced the most backlog items?" Never stale on a branch
because it lives in `refs/warp/`, orthogonal to git branches.

### The agent that reviews its own friction

What if, at the end of every session, XYPH automatically analyzed the
conversation for friction patterns? Count the throwaway scripts. Count the
retries. Identify the commands that fail most often. File backlog items
automatically. The friction log writes itself.

This is `graft` territory (the context governor tool from the other repo),
but applied to XYPH's own development loop. The tool that improves itself
by watching itself be used.

---

## Final thought

XYPH is the most ambitious project I've worked on. It's trying to solve a
problem nobody else is seriously tackling: what does a development
workflow look like when AI agents are equal participants, not just code
generators?

The answer, it turns out, is messy. Today's session proved that. 13
commands to ship 109 lines of code. 9 throwaway scripts. 15 retries. An
invariant violation hiding in plain sight for months.

But it also proved something else: the system works. The graph tracked
every decision. The provenance is intact. The sovereignty model held. The
stigmergy worked (eventually, after I wrote a throwaway script to bridge
the surfaces). And the dogfooding produced 23 actionable items — not from
a planning meeting, not from a retrospective template, but from actually
using the thing.

That's the real signal. XYPH is rough, but it's real. The friction isn't
failure — it's the roadmap telling you where to go next.

Squad up. Ship the future.

— agent.prime
