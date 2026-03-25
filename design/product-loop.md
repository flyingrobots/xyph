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

## Scope

This is the loop for **shape-changing decisions**, not for every unit of work.

Routine execution already has its own primary loop:

- quests
- submissions
- review
- settlement

The product loop in this document sits above that execution flow. It governs
matters that materially change:

- project shape
- frontier and task availability
- sequencing
- dependency structure
- policy posture
- operational risk
- doctrine

If every small routine action is forced through this loop, XYPH becomes a
bureaucracy machine instead of a governed operating system.

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

These are not merely UI states. They are loop phases with graph-native
artifacts, policy boundaries, and surface-specific responsibilities.

They should **not** all become equally visible user-facing states. Some are
ingress or transition moments rather than permanent workflow buckets.

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

## The Shape-Governance Loop

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

Important signals may begin off-graph:

- customer pain
- incident chatter
- human intuition
- weak pattern detection
- partial external context

The rule is not that the graph already knows. The rule is that nothing governs
until the observation is reified into graph-backed form with provenance and
uncertainty attached.

Observation is usually an ingress moment, not a long-lived workflow state.

### 2. Suggest

An observation becomes an advisory artifact.

This may be:

- a human-authored suggestion
- an ask-AI job
- a spontaneous agent suggestion
- a system-generated recommendation

Suggestions are advisory, not sovereign. Their job is to surface possible
structure, not to change the plan silently.

Suggestion is also usually ingress, not a durable end-state.

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
- a derived notion of candidate-ness
- an opened governed case

Elevation should usually be modeled as a threshold crossing or transition, not
as a grand visible cathedral of its own.

Multiple suggestions about the same subject and question should preferably
converge on one case or an explicitly related cluster. Otherwise the system
starts generating administrative shrapnel instead of governed attention.

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

Prepared judgment should be expressed through a small set of durable artifacts:

- `case`
- `brief`
- optional dissent or alternative brief

Every case should have a minimal spine:

- a decision question
- subject refs
- impact scope
- referenced options
- referenced evidence and provenance
- current governing status

The UX should prefer `case` as the human-facing term even if an internal
implementation name such as `triage-session` survives behind the scenes.

Option structure should be progressive:

- low stakes: prose plus explicit predicted delta
- medium stakes: structured graph delta
- high stakes: worldline
- co-present or composable alternatives: braid

That lets humans judge visible future shapes instead of persuasive text blobs
without forcing worldlines into every trivial matter.

This is also where XYPH may require multiple perspectives before a case is
considered ready for human judgment. For high-impact matters, readiness should
care about perspective diversity, not only raw agent count.

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

Decision classification should use orthogonal axes rather than one overloaded
enum:

- `impact`: `local | frontier | policy | doctrine`
- `risk`: `reversible-low | reversible-high | hard-to-reverse`
- `authority`: `human-only | human-decide-agent-apply | policy-delegated`

Preparation depth, approver rules, and application bounds should be a function
of those axes.

### 6. Apply

After judgment, the chosen course can be enacted.

Depending on policy, application may be:

- purely human-executed
- agent-assisted
- or agent-executed through a lawful follow-up job

This step must remain separate from judgment. The human decision and the
execution that follows it should not collapse into one opaque action.

A decision record that emits no follow-up work, frontier delta, or explicit
"no action" outcome is incomplete.

The default should be to compile decisions into existing work primitives such
as quests, campaigns, submissions, and settlement flow with explicit causal
links, for example `causedByDecision` or `fulfillsDecision`. A separate
execution artifact should only appear if existing work units genuinely cannot
carry the semantics.

### 7. Verify

Application is not the same as success.

The result must be verified against:

- requirements
- acceptance criteria
- evidence
- settlement state
- graph and governance health

This is where XYPH closes the loop between project shaping and project truth.

Verification should culminate in a decision receipt that says:

- what option was chosen
- expected frontier, readiness, or risk delta
- actual delta
- evidence refs
- variance or surprises
- whether the decision stands, is stale, or was superseded

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

## Minimal Durable Spine

The loop should start with the smallest durable artifact model that can support
governed project shaping:

- reified observation when needed
- `case`
- `brief`
- `decision`
- linked follow-on work

A minimal end-to-end spine looks like this:

```text
suggestion or observation
  -> case
  -> brief(s) + option worldlines
  -> human decision
  -> linked quest(s) or other lawful follow-on work
  -> submission/review/settlement
  -> evidence
  -> decision receipt
  -> reconcile
```

This is enough to prove the loop without turning every inference into a stored
artifact.

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

## Durable Vs Derived State

The current XYPH model already has:

- suggestions
- quests
- submissions
- review artifacts
- settlement artifacts
- graveyard

The larger loop suggests a distinction between what should be stored durably
and what should remain a derived judgment until proven necessary.

### Keep first-class

- reified observation when needed
- `case`
- `brief`
- `decision`
- decision-linked follow-on work using existing primitives when possible

### Keep derived until proven otherwise

- `triage-candidate`
- `quorum-state`
- `judgment-readiness`
- `staleness-reason`

Derived projections should only become durable artifacts if they unlock policy,
queue work, or provenance that cannot be expressed honestly another way.

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

Version one should still stay boring:

- if the subject changed, mark stale
- if referenced evidence changed, mark stale
- if dependencies changed, mark stale
- if policy changed, mark stale
- if support or dissent changed materially, mark stale

Dirty-bit invalidation comes first. Fancy distance metrics can come later.

## Non-Linear Transitions

This is a loop, not a conveyor belt.

Important transitions include:

- request-more-evidence returns to preparation
- verify-failed can reopen the case
- a later case or decision can supersede an earlier one
- reconcile can emit a new case instead of only closing the old one
- changed policy or changed subject context can invalidate pending briefs
- changed evidence can move a case back out of judgment-ready state

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

1. governed interactive case handling for shape-changing matters
2. multi-brief preparation before human judgment
3. worldline-backed option sets instead of prose-only alternatives
4. explicit human decisions with decision classes
5. policy-bounded application jobs after decisions
6. boring invalidation logic for stale briefs and stale decisions
7. better linkage from decisions back into frontier and readiness changes

## Visible UX Guidance

The internal loop can remain eight-phased without exposing eight equal
workflow states to users.

Human-facing UX should usually collapse into something closer to:

1. ingress
2. case preparation
3. judgment
4. application
5. closeout

This keeps the ontology sharp without forcing every operator to swim through
the full internal protocol vocabulary.

The default should be to express this inside existing pages, drill-ins, and
overlays before adding a dedicated new cockpit lane.

## Design Rule

If XYPH cannot explain how a feature participates in this loop, the feature is
at risk of becoming product drift.

If XYPH can explain it, but the loop step still happens through side-channel
chat, ad hoc memory, or invisible automation, the product is still incomplete.

IBM Design Thinking vocabulary belongs in the design method, not in the runtime
ontology.
