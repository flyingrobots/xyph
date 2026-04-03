# METHOD Alignment

This document records how XYPH should align with METHOD without collapsing
XYPH into a filesystem-native workflow tool.

## Position

XYPH should be **METHOD-aligned, not METHOD-prescriptive**.

That distinction is load-bearing.

METHOD has several strong ideas that fit XYPH well:

- the human and the agent are both first-class sponsors
- hills and playback questions define what "done" means
- agent-facing clarity should be built early, not bolted on later
- witnesses must be reproducible, not atmospheric
- backlog and retrospective discipline matter

But METHOD's literal filesystem doctrine does not transfer directly into XYPH.
XYPH's product and repo doctrine already says:

- the graph is the plan
- Git is settlement/object storage, not the workflow model
- workflow law should remain programmable through ontology, policy, and
  projections rather than hardcoded directory semantics

So the job is not to import METHOD as-is. The job is to translate METHOD into
graph-native XYPH terms.

## What XYPH Adopts From METHOD

### Same-table sponsorship

Every meaningful cycle should still name:

- sponsor human
- sponsor agent
- the hill being improved
- playback questions for both perspectives

This already fits the design corpus and should remain the default discipline.

### Agent-surface pressure first

XYPH should continue to prefer agent-surface clarity first unless a cycle is
explicitly human-first exploratory design.

That means the shared semantic packet, lawful action model, and machine-facing
truth should usually stabilize before the human surface is polished around
them.

### Reproducible witness

METHOD is right that a claimed result is not done unless it can be reproduced.
XYPH should keep treating witnesses as rerunnable proof:

- executable tests
- graph-linked evidence
- transcripts
- durable receipts
- replayable commands or mechanisms

Observational artifacts are useful support. They are not enough by themselves
to carry the done-claim.

### Drift-aware closeout

The end of a bounded cycle should still force honest bookkeeping:

- retro
- backlog reconciliation
- graveyard review
- doc reconciliation
- explicit naming of drift

That discipline matters even if the storage model changes.

## What XYPH Must Translate Rather Than Copy

### 1. The graph is the plan

METHOD's phrase "the filesystem is the database" does not become literal truth
inside XYPH.

For XYPH, the authoritative workflow substrate is the graph. Files and repo
docs may still exist, but they are:

- signposts
- companion artifacts
- generated summaries
- design-side notes

They are not the primary workflow database.

### 2. Filesystem lanes become graph-native projections

METHOD backlog lanes are still useful, but XYPH should represent them as
governed graph-visible state and projections rather than as authoritative
directory membership.

In other words:

- "inbox" is a workflow meaning, not necessarily a folder
- "up next" is a prioritization judgment, not necessarily a filename location
- "graveyard" is a governed outcome, not merely a path on disk

The filesystem may still host exports or companion docs for those views, but
the governing truth should stay programmable.

### 3. Cycle commitment becomes a lawful transition

Pulling work into an active cycle should eventually be a graph-visible,
policy-bounded act with provenance, not only a file move from one folder to
another.

The design note in `design/cycles/` remains useful, but it should be anchored
to graph-visible work instead of pretending the markdown file itself is the
whole commitment.

### 4. Signposts summarize; they do not secretly govern

Repo-visible signposts are still valuable. XYPH already benefits from a small
set of docs that explain direction and current truth.

But signposts should remain:

- bounded
- inspectable
- explicitly derived from repo-visible or graph-visible sources

They should not become a shadow planning database.

### 5. METHOD must remain a programmable profile

If XYPH eventually enforces METHOD directly, it should do so as a configurable
workflow profile expressed through:

- ontology
- policy
- projections
- lawful transitions
- witness requirements

It should not be frozen into XYPH as the only possible workflow worldview.

## Translation Table

| METHOD concept | XYPH-aligned form |
|---|---|
| Backlog lane | Graph-visible priority or lifecycle state projected into CLI/TUI/docs |
| Pull into cycle | Governed selection of graph-visible work plus a design-side cycle note |
| Design doc | Companion artifact in `design/` anchored to graph-visible work |
| RED/GREEN | Executable acceptance spec and passing behavior, unchanged in spirit |
| Witness | Graph-linked evidence plus rerunnable commands, receipts, or tests |
| Retro | Closeout artifact tied to the bounded slice and backlog reconciliation |
| Repo signpost | Summary or generated view, never hidden source of authority |

## Current Repo Posture

Until XYPH models more of this loop natively, the repo should use a hybrid
stance:

- design notes in `design/` remain valid companion artifacts
- cycle notes remain valid design-side constraints
- retrospectives remain valid closeout artifacts
- contributor workflow should still reconcile graph truth, docs, and tests at
  cycle boundaries

The important rule is that repo docs must not quietly replace graph truth once
the graph already has a real representation for the same decision.

## Non-Goals

This alignment does **not** mean:

- rewriting XYPH into METHOD's literal directory tree
- making markdown files the authoritative storage for workflow state
- hardcoding one repo doctrine into the product before the ontology and policy
  are ready
- treating METHOD as a reason to reduce XYPH's programmability

## Short Version

METHOD's strongest ideas fit XYPH well.

METHOD's literal storage model does not.

XYPH should absorb the discipline:

- shared human/agent sponsorship
- hills
- playbacks
- witnesses
- honest closeout

and re-express that discipline through graph-native, programmable workflow
truth rather than through fixed filesystem ceremony.
