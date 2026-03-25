# Product Model

This document holds the unified human + agent product model for XYPH.

It assumes the invariants in [Invariants](./invariants.md). If a product idea
conflicts with those invariants, the idea must change rather than the system
quietly drifting away from its own architecture or governance model.

## Product Principles

### 0. One Product, Two Lenses

XYPH is one product with two primary operating lenses:

- human judgment and governance surfaces
- agent-native command and protocol surfaces

Those lenses should share semantics and diverge only in presentation,
interaction style, and authority boundaries.

If a concept exists only in one surface and cannot be expressed in the shared
semantic model, it should be treated as suspect until proven necessary.

### 1. Landing For Triage, Pages For Judgment

The cockpit is the landing page, not the whole app.

Use the landing page for:

- orientation
- queue scanning
- freshness and attention routing
- suggestion scanning for human and agent pickup
- quick preview

Use drill-in pages for:

- full context
- comments
- review decisions
- attestation and settlement actions
- detailed lineage and history

### 2. One Selected Item, One Real Page

If a selected item matters enough to govern, it deserves a dedicated page. The
inspector is a preview surface, not the final home for deep workflows.

### 3. Freshness Is Not The Same As Urgency

XYPH must distinguish:

- **fresh**: new since this observer last saw it
- **hot**: needs judgment or action now
- **blocked**: cannot progress yet
- **historical**: recent but informational only

Badges and cues should reflect those differences instead of collapsing all
attention into one dot.

### 4. Governance Is A First-Class Product Surface

Review, comparison, attestation, and collapse are not implementation detail.
They are central parts of the operator workflow and deserve purpose-built
surfaces.

### 4a. Agent Workflow Is A First-Class Product Surface

The agent-native CLI and interaction model are part of the product, not a
compatibility appendix. They should be designed with the same rigor as the
human cockpit.

### 5. Graveyard Is Part Of The Product, Not An Embarrassment

Dead, rejected, and retired work is still graph truth. Graveyard must remain
visible, explorable, and actionable where reopen is lawful.

### 6. Inspector Is Preview, Not Prison

The right inspector should help decide whether to drill in. It should not be
forced to carry every page's full workflow forever.

### 7. Keyboard First, Mouse Complete

Keyboard remains the primary control model. Mouse support should feel native,
not bolted on. Every major landing-page operation should work via either input
mode.

### 8. Help Must Be Contextual

Help must explain the controls and actions relevant to the current page or
focused region. It should not replace the app with an unrelated global screen.

### 9. The Design System Must Be Intentional

BIJOU provides the toolkit. XYPH still needs its own semantic token layer and
page rules:

- lane identity
- page chrome
- attention tones
- modal behavior
- freshness and hot-state cues
- overflow and scroll treatment

### 10. AI Suggestions Are Advisory, Not Sovereign

AI-generated suggestions can propose structure, highlight likely next steps,
and queue work for humans or agents to consume. They cannot silently become
graph truth.

### 11. AI Must Be Explicitly Marked

AI-generated or AI-assisted content must never masquerade as ordinary product
copy or settled graph truth. XYPH should use a dedicated `[AI]` component
wherever AI presence needs to be recognized and explained.

### 12. Every Idea Enters The Same Lifecycle

Quest creation should not bypass governance just because it is initiated from a
nice page, by a human, or by an agent. Every new work idea enters through the
same lifecycle:

`suggested -> BACKLOG -> PLANNED -> READY -> IN_PROGRESS -> ...`

### 13. "Ask The AI" Must Be An Explicit Job

If XYPH lets a user ask AI for help, that request must become an explicit job
or suggestion artifact in the queue. It should be inspectable, targetable, and
explainable, not a hidden side channel.

### 14. Same Graph, Different Lenses

Humans and agents should consume the same graph truth through different lenses.
The human landing cockpit and the agent-native CLI should disagree in format,
not in reality.

### 15. Agent-First Technical Seams, Human-First Judgment

By default, XYPH should implement shared semantics and agent-native seams
first, because they force ambiguity into the open quickly:

- explicit inputs
- explicit outputs
- explicit lawful actions
- explicit refusal reasons
- explicit state transitions

That default does **not** mean the product is agent-led in judgment.

Human-facing design still governs:

- what must be understandable
- what must be explainable
- what must remain reviewable and governable

In short:

- let humans define the judgment model
- let agents force the model to become explicit

### 16. XYPH Must Embody The Product Loop It Claims To Govern

XYPH's value is not only that it shows project state. It should embody the
governed loop by which **project shape** evolves:

- observation
- suggestion
- elevation
- judgment preparation
- decision
- application
- verification
- reconciliation

This is not the universal loop for every routine work item. It is the
shape-governance loop for matters that materially alter frontier, sequencing,
policy, risk, or doctrine.

If a feature cannot be placed in that loop, it is at risk of becoming drift.
If the loop still depends on side-channel memory or hidden automation, the
product remains incomplete even if the UI feels polished.

Shape-governance cases should classify matters through orthogonal axes instead
of mixed enums:

- impact
- risk
- authority

And where possible, decisions should compile into existing work primitives with
causal linkage rather than inventing new execution nouns by default.

## Shared Primitive Model

### Work Primitives

These are the core work-shaping primitives XYPH should treat as first-class:

- **Intent**: why the work matters in sovereign terms
- **Story**: human-meaningful scenario that refines intent
- **Requirement**: specific thing that must be true
- **Acceptance criterion**: testable or reviewable condition for a requirement
- **Evidence**: proof, linkage, or attested observation that bears on a
  criterion
- **Quest**: the executable work unit that implements one or more requirements
- **Submission**: proposed change packet that can be reviewed and settled

Design rule:

- quests are labor
- requirements and criteria are spec
- evidence is proof
- submissions are proposed change

### Governance Primitives

XYPH should expose these as explicit product concepts:

- **Review item**
- **Comparison artifact**
- **Attestation**
- **Collapse proposal**
- **Decision artifact**

Pages and queues should surface these shared judgments:

- `requirements`
- `acceptanceCriteria`
- `evidenceSummary`
- `blockingReasons`
- `missingEvidence`
- `nextLawfulActions`
- `expectedActor`
- `claimability`
- `attentionState`

### Agent-Native Primitives

The agent-native layer should speak in packets, not prose blobs.

Minimum shared packet types:

- **Briefing packet**
- **Next candidate**
- **Context packet**
- **Act result**
- **Handoff note**

Across those packets, XYPH should reuse the same semantic fields wherever they
apply.

### Alignment Rule

No significant human-facing feature should be considered complete until the
same underlying semantics exist in the agent surface, unless the cycle
explicitly declares that feature human-only and explains why.

Likewise, agent-native functionality should not invent hidden semantic fields
that the human surface cannot inspect or explain.

## Agent CLI Interaction Model

The agent CLI should be designed with the same intentionality as the TUI.

The equivalent model is:

- `briefing` = landing page
- `next` = prioritized action queue
- `context <id>` = item page
- `act` = lawful page-local action surface
- `handoff` = closeout and durable session transfer

That means the CLI should optimize for:

- fast orientation
- direct work selection
- full-context drill-in
- clear authority boundaries
- durable closeout

The machine-readable and human-readable modes should differ in format, not in
semantic completeness.

### Preferred Build Sequence

For most cycles, the preferred order is:

1. shared semantic model
2. agent packet / CLI expression
3. human page or TUI surface

This keeps the TUI from becoming a place where missing ontology is papered over
with local UI state.

### Graph Truth vs Derived Judgment

The design should assume three layers:

1. **Graph truth**
2. **Derived judgment**
3. **Surface framing**

This keeps XYPH from storing decorative UI state in the graph while also
preventing important governance judgments from being hidden inside transient UI
code.

## Attention Model

XYPH uses multiple attention states on purpose:

- **fresh**
- **hot**
- **blocked**
- **historical**

AI suggestions can participate in this model, but the `[AI]` marker is separate
from attention. A suggestion can be `[AI]` and also be fresh, hot, blocked, or
historical.

Agent-targeted suggestion jobs can also be:

- **claimable**
- **reserved**
- **awaiting-human**

Those states should not be collapsed into ordinary freshness.

## Stepper Use

BIJOU stepper is appropriate for bounded governance flows, not for global
navigation.

Good uses:

- `compare -> attest -> ready -> collapse -> executed`
- `submitted -> review -> approved/changes requested -> settled`

Bad uses:

- turning top-level XYPH lanes into a wizard
- pretending the whole app is one linear process

## Contextual Help

Help must be generated from the same control model as the footer and page
actions. It should:

- appear as an in-app modal
- be scrollable when needed
- prioritize the controls relevant to the current focused area
- distinguish global controls from local actions

## Design-System Requirements

XYPH should sit on BIJOU while defining its own semantic product tokens and
interaction rules.

Requirements:

- lane-scoped accents
- semantic tones for fresh / hot / blocked / success / graveyard
- consistent page headers and breadcrumbs
- consistent modal and drawer treatment
- scroll / overflow behavior that is explicit but not noisy
- page-local action treatment that reads as intentional, not improvised
- a stable `[AI]` component with broad and inline variants
- consistent explainability modal or popover behavior for AI-marked content

The rule is: BIJOU provides primitives; XYPH provides product meaning.

## Immediate Design Program

The next design-led product slices should follow this order:

1. finish the landing-page vs drill-in-page split
2. add dedicated page types for review, settlement, and suggestion artifacts
3. keep the human and agent surfaces aligned to the same primitive model
4. add AI suggestion queues for human and agent pickup
5. add the `[AI]` transparency component and explainability flow
6. add explicit ask-AI jobs and suggestion-backed quest creation
7. add live graph-feed mode driven by graph mutation subscription
8. tighten contextual action models on those pages and CLI flows
9. deepen the recent-activity and attention-routing model
10. refine the semantic token layer for XYPH on top of BIJOU

## What We Should Not Do

- do not treat the landing cockpit as the permanent home for all detail and all
  actions
- do not keep inventing new panes when a real page is required
- do not overload freshness badges with urgency semantics
- do not hide Graveyard because it feels less flattering than active work
- do not use BIJOU primitives without defining XYPH product meaning on top
- do not ship deep interaction changes without updating the design corpus when
  the product model changes
