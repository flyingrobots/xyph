# 0024: Graph-Native Backlog And Case Modeling

## Cycle Type

Workflow-model alignment

This cycle turns the new METHOD alignment posture into a concrete XYPH slice:
backlog lanes, governed cases, and closeout semantics should read as one
programmable graph-native workflow instead of as separate doctrines stitched
together by repo habit.

## Status

Prepared follow-on cycle.

This note is intentionally concrete, but it should not supersede the active
implementation work in
[0023: Observer-Native Read Architecture](./0023-observer-native-read-architecture.md).
It is the next workflow-model slice to pull once the current read-boundary work
closes and backlog reconciliation confirms the anchor honestly.

## Graph Anchor

- Primary existing work item: `task:TRG-001`
- Related existing work item: `task:TRG-003`

Those graph-visible triage tasks predate the newer case/brief doctrine and
still use older proposal-centric language. This cycle exists partly to
translate that older backlog truth into the current XYPH ontology instead of
pretending the old nouns are still the final model.

## Why This Cycle Exists

XYPH now has enough pieces that the gap is obvious:

- backlog-like quest states and triage flows
- suggestions as advisory ingress
- partial `case` / `brief` / `decision` ontology
- agent-facing case discovery and briefing paths
- a product-loop doctrine that treats shape-changing judgment as a governed
  case flow
- a METHOD alignment note that says lanes are judgments and the graph is the
  plan

What XYPH still lacks is the connective tissue between those pieces.

Right now, too much of the shaping loop still risks drifting into one of these
bad states:

- backlog lanes acting like implicit folder metaphors rather than graph-native
  judgments
- case work acting like a separate special doctrine instead of one lawful
  extension of the shaping loop
- old proposal/review vocabulary surviving past the point where `case` /
  `brief` / `decision` are the clearer product nouns
- humans and agents having to infer when something is just backlog work versus
  when it requires governed case preparation

This cycle should make that boundary explicit.

## Sponsor Actors

### Primary sponsor actor

**Operator-Supervisor**

Needs one truthful shaping model where they can distinguish:

- ideas that merely belong in backlog attention
- work that is ready to become a bounded quest
- matters that require governed case judgment

without relying on repo folklore, proposal-era vocabulary, or hidden side
channels.

### Secondary sponsor actors

**Cold-Start Worker Agent**

Needs agent-facing queues and context to say clearly whether a target is:

- routine backlog shaping
- ordinary quest execution
- or governed case preparation

so it can help without shell archaeology or authority confusion.

**Application Integrator**

Needs the shaping workflow to be programmable through graph-visible semantics,
policy, and projections rather than hardcoded directory or status rituals.

## Outcome Hill

**As a human or agent shaping new work, I can move from suggestion or backlog
attention into either routine quest follow-on work or a governed case through
explicit graph-native semantics, so XYPH's shaping loop becomes programmable
and inspectable instead of depending on stale proposal language or filesystem
metaphors.**

## Invariants

This cycle must preserve:

- The graph is the plan.
- Backlog lanes are judgments or lifecycle semantics, not authoritative folder
  membership.
- `case` remains the governed spine for shape-changing matters; it is not the
  universal wrapper for every quest.
- Human judgment remains the governing authority for case decisions unless
  policy says otherwise explicitly.
- Agent-first implementation remains the default pressure, but human
  explainability remains the legibility bar.
- Repo docs and exports may summarize workflow state, but they must not become
  a hidden second source of truth once graph-native truth exists.
- Existing nouns should be reused where possible: `suggestion`, `quest`,
  `case`, `brief`, `decision`, `graveyard`.
- This cycle should reduce stale `proposal` / `review-proposal` thinking, not
  deepen it.
- The resulting model must remain programmable enough that METHOD could later
  be expressed as a workflow profile rather than as XYPH's only hardcoded
  worldview.

## Scope

In scope:

- define the graph-native relationship between:
  - suggestions
  - backlog attention / shaping state
  - governed cases
  - case decisions
  - linked follow-on quest work
- define when a shaping matter should stay routine backlog work versus when it
  should be elevated into a governed case
- define how backlog-lane meaning should be represented: durable graph truth,
  derived judgment, or projection
- define how rejection, defer, supersession, graveyard, and reopen semantics
  should read across backlog and case flows
- define the first agent-facing read/action expectations for this model
- define the first human-facing page/worklist expectations for this model
- write acceptance tests that pin the graph semantics before surface polish

Out of scope:

- implementing a full METHOD workflow engine
- replacing all repo exports or signposts with graph-generated equivalents in
  the same slice
- generic voting, quorum, or multi-approver governance machinery
- forcing every triage action through a governed case
- broad TUI aesthetic or navigation polish
- arbitrary workflow-profile scripting beyond what one concrete slice needs

## Desired End-State

The intended shape is:

1. **Advisory ingress**
   - observations and suggestions enter with provenance
   - they may remain advisory or be linked to backlog attention

2. **Backlog attention**
   - routine shaping work exists without requiring a governed case
   - backlog lane semantics are explicit and inspectable
   - those semantics are graph-native or graph-derived, not directory-native

3. **Governed elevation**
   - shape-changing matters can be elevated into a `case`
   - the case names the decision question, subject refs, and governing status
   - `brief` artifacts prepare judgment without pretending to be the decision

4. **Decision and follow-on work**
   - a case decision can:
     - create linked follow-on quest work
     - defer without silently mutating the frontier
     - reject and preserve rationale
     - supersede older shaping attempts
   - graveyard and reopen semantics remain visible and attributable

5. **Programmable workflow**
   - the shaping loop is expressible through ontology, policy, and projections
   - future METHOD enforcement can sit on top of this model rather than
     replacing it with folder law

## Acceptance-Test Plan

### Checkpoint 1: Routine backlog vs governed case

1. A shaping target can remain routine backlog work without requiring a case.
2. A shape-changing target can be elevated into a `case` without inventing
   hidden state outside the graph-backed model.
3. The system can explain why a target is still backlog attention versus why it
   now requires governed case handling.

### Checkpoint 2: Shared human/agent truth

4. Agent-facing `briefing`, `next`, and `context` distinguish routine backlog
   shaping work from governed case preparation cleanly.
5. Human-facing worklists or pages can inspect the same distinction without
   inventing separate local semantics.
6. A backlog item or suggestion linked to a case exposes that relationship in
   both lenses.

### Checkpoint 3: Decision compilation

7. A case decision can create or link follow-on quest work using existing work
   primitives instead of reviving proposal-era pseudo-statuses.
8. Rejection, defer, graveyard, and reopen behavior remain durable,
   attributable, and inspectable.

### Checkpoint 4: Programmability and regression safety

9. No required workflow meaning depends on repo directory layout.
10. The first slice stays boring and inspectable in JSON before richer surface
    behavior is layered on top.
11. Focused acceptance tests pin the model before wider surface expansion.

## Implementation Notes

- Prefer `case` / `brief` / `decision` over stale `proposal` vocabulary unless
  a legacy graph artifact must still be translated explicitly.
- Do not add a new quest status just to simulate governed judgment if the
  judgment belongs on a case or decision artifact.
- Backlog lanes may remain partly derived if that keeps the model honest; this
  cycle should not rush durable identity onto every judgment.
- Use this cycle to clarify which shaping semantics deserve durable graph
  identity and which should stay projections.
- Keep the first slice agent-legible and machine-inspectable before making it
  pretty in the TUI.

## Playback Questions

After the first implementation checkpoint lands, ask:

1. Could a cold-start agent tell whether a target was routine backlog shaping
   or governed case work without shell archaeology?
2. Could a human operator tell why a matter had been elevated into a case?
3. Did the resulting workflow feel programmable and inspectable, or did it
   still smell like hidden folder law wearing graph clothes?
4. Did case handling feel like a lawful extension of the shaping loop rather
   than a separate special religion?

## Exit Criteria

This cycle closes when:

- the backlog/case boundary is explicit in graph-native semantics
- routine backlog work and governed case work can both be represented honestly
- agent and human surfaces can read that distinction from the same underlying
  truth
- the first acceptance suite pins the model
- the retrospective names what still remains projection-only versus what should
  become durable in a later slice
