# Product Loop

This document captures the larger process XYPH is trying to embody and enforce.

XYPH is not only a place where work is displayed, reviewed, or mutated. It is
meant to be the conduit through which a project's shape is discovered,
proposed, judged, enacted, verified, and revised.

That loop is part of the product.

## Why This Matters

The strongest value proposition XYPH appears to offer is not "a better TUI" or
"an agent-native CLI." It is a governed, provenance-visible project loop where:

- ideas enter visibly
- competing recommendations can accumulate
- humans and agents can contribute different kinds of judgment
- frontier-shaping decisions become explicit
- execution follows judgment instead of bypassing it
- the graph remains the plan throughout

If XYPH succeeds at that, it stops being only a project browser and becomes the
operating system for project evolution.

## Core Thesis

XYPH should model and enforce a project loop like this:

1. **Observe**
2. **Suggest**
3. **Elevate**
4. **Prepare judgment**
5. **Decide**
6. **Apply**
7. **Verify**
8. **Reconcile**

These are not merely UI states. They are product states with graph-native
artifacts, policy boundaries, and surface-specific responsibilities.

## IBM Design Thinking Frame

This loop should be designed the same way the rest of XYPH is designed:

- with sponsor actors in mind
- through outcome-oriented hills
- through repeated playbacks against real graph-backed states

That means:

- human sponsor actors define what judgment must remain understandable,
  governable, and explainable
- agent sponsor actors define what must become explicit, machine-readable, and
  queue-consumable
- hills should describe what becomes easier or safer at each step of the loop
- playbacks should test whether humans and agents can move through the same
  case without drifting into separate realities

In other words, this loop is not outside the design method. It is the larger
product pattern the design method is trying to sharpen.

## The Loop

### 1. Observe

Something becomes visible:

- a blocked quest
- a stale review
- a governance gap
- a promising idea
- a repeated failure pattern
- a frontier or dependency problem

This may be observed by:

- a human
- an agent
- or a derived XYPH analysis surface

The important rule is that observation should be anchored in graph truth rather
than hidden side-channel intuition.

### 2. Suggest

An observation becomes an advisory artifact.

This may be:

- a human-authored suggestion
- an ask-AI job
- a spontaneous agent suggestion
- a system-generated recommendation

Suggestions are advisory, not sovereign. Their job is to surface possible
structure, not to change the plan silently.

### 3. Elevate

Most suggestions should die quietly or remain informational.

Only some should be elevated into a governed decision path. Elevation may
happen because:

- a human explicitly escalates it
- multiple independent agents converge on it
- policy says the suggestion class requires triage
- the suggestion touches a hot governance or frontier area
- the suggestion materially changes project shape, sequencing, or risk

This implies a distinction between:

- `suggestion`
- `triage-candidate`
- `triage-session`

### 4. Prepare Judgment

Once elevated, the system should gather enough context for lawful judgment.

This is where agents are especially strong:

- summarize the subject
- collect provenance and relevant background
- propose options
- explain tradeoffs
- identify risks and missing evidence
- argue for a recommendation

Crucially, this is not yet the decision.

Prepared judgment should likely be expressed through artifacts like:

- `triage-prep-job`
- `triage-brief`
- `triage-support`
- `triage-dissent`

This is also where XYPH may require multiple perspectives before a case is
considered ready for human judgment.

### 5. Decide

A human makes the governing decision.

This is the point where sovereignty, policy, and explainability matter most.
The human should not be rubber-stamping an agent recommendation. They should be
adjudicating a case with visible inputs, rationale, uncertainty, and
alternatives.

Typical outcomes may include:

- adopt
- reject
- defer
- request more evidence
- supersede with another course
- no action

The decision itself must be durable, attributable, and rationalized.

### 6. Apply

After judgment, the chosen course can be enacted.

Depending on policy, application may be:

- purely human-executed
- agent-assisted
- or agent-executed through a lawful follow-up job

This step must remain separate from judgment. The human decision and the
execution that follows it should not collapse into one opaque action.

### 7. Verify

Application is not the same as success.

The result must be verified against:

- requirements
- acceptance criteria
- evidence
- settlement state
- graph and governance health

This is where XYPH closes the loop between project shaping and project truth.

### 8. Reconcile

Every meaningful cycle should feed back into the evolving project shape:

- backlog changes
- graveyard review
- reopened work
- new debt
- new ideas
- changed frontier
- changed doctrine

This is why cycle closeout and backlog reconciliation are part of the product
model, not external process fluff.

## Human And Agent Roles In The Loop

XYPH should design the loop equally from both perspectives.

### Human role

Humans are strongest at:

- determining whether a matter deserves judgment
- deciding what tradeoff is acceptable
- setting or overriding direction
- deciding when more evidence is needed
- owning rationale

### Agent role

Agents are strongest at:

- surfacing candidate structure quickly
- gathering relevant context
- preparing comparative briefs
- identifying alternatives and consequences
- executing routine follow-up lawfully
- keeping the loop moving without losing provenance

### Alignment rule

The human and agent roles are different, but they should be working on the same
case file, not parallel realities.

## Emerging Product Primitives

The current XYPH model already has:

- suggestions
- quests
- submissions
- review artifacts
- settlement artifacts
- graveyard

This larger loop suggests additional primitives that XYPH may need:

- `triage-candidate`
- `triage-session`
- `triage-prep-job`
- `triage-brief`
- `triage-decision`
- `triage-application-job`
- `quorum-state`
- `judgment-readiness`
- `staleness-reason`

These should only be introduced if they sharpen the product loop rather than
add bureaucracy.

## Staleness And Observer Geometry

The loop also suggests that freshness and staleness cannot be purely temporal.

A triage brief, recommendation, or decision may be outdated because:

- the relevant subject changed
- dependencies changed
- evidence changed
- support or dissent changed
- the surrounding governance state changed

XYPH should eventually model staleness as distance from the observation and
context a judgment was based on, not merely "age in days."

That makes this an observer-geometry problem, not only a timestamp problem.

## Human Hills For This Loop

These are the human-facing outcomes implied by the loop:

### Hill H1: Govern Project Shape Without Side Channels

When a project-shaping question arises, a human can move from observation to
judgment inside XYPH without needing external documents, hidden chat context,
or private memory to understand what is at stake.

### Hill H2: Judge Prepared Cases, Not Raw Suggestion Spam

When a human is asked to decide, they see a prepared case with provenance,
alternatives, recommendations, and rationale rather than a flat stream of
unstructured AI or agent output.

### Hill H3: Keep Decisions And Consequences Coupled

When a human makes a decision, they can see what changed the frontier, what
follow-up was created, and whether the decision was later applied or invalidated.

## Agent Hills For This Loop

These are the agent-facing outcomes implied by the loop:

### Hill A1: Contribute Judgment Preparation Without Decision Laundering

When an agent notices a meaningful issue or idea, it can package a high-quality
brief, recommendation, or alternative analysis without being mistaken for the
final authority.

### Hill A2: Consume Triage Work As First-Class Queue Work

When a triage session needs preparation or application follow-up, an agent can
consume that work through XYPH as a clear, lawful queue item instead of
reverse-engineering intent from scattered state.

### Hill A3: Help Shape Frontier Honestly

When agent work influences the future shape of the project, that influence is
visible, explainable, and routed through governed artifacts rather than hidden
automation.

## How This Fits Into Cycles

This loop is larger than any single cycle.

A cycle should usually implement one bounded part of it, for example:

- suggestion emission
- suggestion adoption
- interactive triage
- decision application
- evidence verification
- backlog reconciliation

The mistake would be to treat those slices as unrelated features. They are
pieces of one larger product loop.

This means cycle notes should increasingly answer:

- which step of the loop is this slice improving?
- which human hill does it move?
- which agent hill does it move?
- what artifacts enter or leave the loop because of this slice?

It also means cycle closeout should ask whether the slice left the loop
cleaner, clearer, and more governable than before. If it did not, then code
may have landed without actually improving the product.

## Current Gaps

Based on current design and implementation, the biggest missing pieces in the
loop appear to be:

1. governed interactive triage
2. multi-brief preparation before judgment
3. explicit human triage decisions
4. policy-bounded application jobs after decisions
5. scoped staleness / observer-distance for briefs and decisions
6. better linkage from decisions back into frontier and readiness changes

## Design Rule

If XYPH cannot explain how a feature participates in this loop, the feature is
at risk of becoming product drift.

If XYPH can explain it, but the loop step still happens through side-channel
chat, ad hoc memory, or invisible automation, the product is still incomplete.
