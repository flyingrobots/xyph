# XYPH Product Design

**Status:** Current source of truth for XYPH's product design across both the
human-facing app and the agent-native interaction layer.  
**Scope:** XYPH landing page, drill-in pages, agent-native CLI/interaction
modes, attention model, page taxonomy, suggestion queues, navigation, and
design-review practice.  
**Relationship to architecture:** `docs/canonical/ARCHITECTURE.md` remains the
technical architecture source of truth. This document is the product and
experience source of truth for the human and agent surfaces built on top of
that architecture. `docs/canonical/AGENT_PROTOCOL.md` remains the protocol and
command-contract source of truth; this document defines the product goals,
roles, flows, and interaction model that should shape that protocol.

## Why This Exists

XYPH has reached the point where truthful substrate behavior exists for
worldlines, compare/collapse, governance artifacts, and a real landing TUI.
What it does **not** yet have is one explicit design model for:

- who the app is for
- what each page is for
- what belongs on the landing page vs a drill-in page
- how attention should be routed
- what "done" looks like for XYPH product slices

This document is the answer. It applies **IBM Design Thinking** to XYPH's
human and agent surfaces, using the parts that fit this product best:

- **Sponsor Users** to keep the app anchored in real operator needs
- **Sponsor Agents** as the agent-native analogue to sponsor users, so the
  agent CLI and machine-facing interaction layer are designed around real agent
  jobs rather than as a pile of commands
- **Hills** to define outcome-based success for major design slices
- **Playbacks** to keep the design legible and continuously reviewable
- the **Observe / Reflect / Make** loop to keep design grounded in real graph
  behavior rather than aesthetic drift

Reference material:

- [IBM Design Thinking](https://www.ibm.com/design/approach/design-thinking/)
- [IBM Enterprise Design Thinking Framework](https://www.ibm.com/training/enterprise-design-thinking/framework)

This is an adaptation, not cargo cult. XYPH should use IBM's outcome-driven
discipline without pretending it is an enterprise SaaS admin console.

## Product Intent

XYPH is the app.

`AION` is the underlying computational / time-travel model that git-warp
implements and that can inform future XYPH surfaces. It is not the product
name of this application.

XYPH exists so a human or agent can:

- understand what changed, who did it, and why it matters
- see the live plan and its speculative alternatives honestly
- inspect and govern review/attestation/settlement state
- inspect AI-driven suggestions without confusing them for human or settled truth
- take lawful action with full context
- recover dead or rejected work without losing causal history
- leave durable graph-native state behind for the next collaborator, whether
  that collaborator is human or agent

XYPH is **not**:

- a generic terminal dashboard
- a second workflow engine separate from the graph
- a decorative history browser
- a branch browser with better branding
- a suggestion box that bypasses governance
- a chat wrapper that replaces the graph with prose memory

The graph is still the plan. XYPH is the place where a human can perceive,
judge, and act on that plan.

## Sponsor Actors

IBM Design Thinking starts by designing for real users with specific outcomes.
For XYPH, that extends naturally into **sponsor actors**: representative humans
and representative agents whose real jobs the product must support.

## Human Sponsor Users

### 1. The Operator-Supervisor

The human who opens XYPH to answer:

- what is happening right now?
- what is blocked?
- what needs my judgment?
- where should I intervene?

Primary success condition:

- can orient within seconds and move from awareness to action without dropping
  to raw JSON or shell archaeology, including when the next thing to inspect is
  an AI-generated suggestion rather than a human-authored artifact

### 2. The Governance Reviewer

The human who must inspect submissions, comparisons, attestations, and collapse
proposals before live truth changes.

Primary success condition:

- can tell what is ready, what is blocked, and what evidence is missing before
  approving settlement

### 3. The Program Steward

The human who needs to understand plan health across campaigns, dead work,
graveyard patterns, and flow quality.

Primary success condition:

- can distinguish live strategic motion from churn, abandonment, or governance
  debt

### 4. The Collaborating Human Builder

The human who works alongside agents and needs a trustworthy surface for
claiming, commenting, promoting, rejecting, reopening, and reviewing work.

Primary success condition:

- can act directly from the right page with the right context, without needing
  to memorize hidden CLI rituals, and can distinguish AI suggestions from
  human-authored truth at a glance

## Agent Sponsor Actors

For the agent-native layer, apply the same IBM discipline but replace "user"
with "agent": design for representative agent jobs, not for an imaginary
generic machine consumer.

### 1. The Cold-Start Worker Agent

The agent that enters a repo cold and needs to become useful quickly.

Primary success condition:

- can orient from XYPH alone, identify true work, understand what is allowed,
  and start acting without spelunking raw files, running redundant shell
  commands, or reverse-engineering graph state

### 2. The Queue-Consuming Agent

The agent that consumes explicit jobs, recommendations, or suggestions from a
queue instead of improvising its own work selection every time.

Primary success condition:

- can pull the next best suggestion or task, understand why it was offered, and
  decide whether to claim, defer, or reject it with machine-readable reasons

### 3. The Reviewing Agent

The agent that reviews submissions, comments on work, or assists with
settlement-related judgment without exceeding its authority.

Primary success condition:

- can tell what it is allowed to review, what evidence is missing, and when a
  human is still required

### 4. The Recommending Agent

The agent that proposes structure instead of mutating it directly.

Primary success condition:

- can emit high-quality, explainable suggestions for quests, dependencies,
  promotions, and follow-up work without those suggestions being mistaken for
  settled graph truth

## Hills

These are the current product hills for XYPH. A hill is an outcome, not a
feature checklist.

### Hill 1: Orient In Under 30 Seconds

When a sponsor user opens XYPH, they can tell:

- what changed recently
- who changed it
- what lane needs attention
- which next item deserves inspection

without reading raw graph data or leaving the landing page.

### Hill 2: Move From Awareness To Lawful Action Without Context Loss

From any highlighted item on the landing page, the operator can drill into a
real item page and perform the next lawful action with all needed context in
view.

### Hill 3: Make Governance Legible

Review and settlement must feel like intentional governance flows, not a pile
of disconnected artifacts. The operator should be able to tell:

- where an item sits in the flow
- what is blocking it
- what evidence is missing
- who is expected to act next

### Hill 4: Keep Dead Work Visible And Recoverable

Rejected or retired work must remain explorable through Graveyard. The operator
should be able to understand why it died, what it depended on, and whether it
should be reopened.

### Hill 5: Make AI Suggestions Transparent And Useful

When XYPH shows AI-generated suggestions, the operator should be able to tell:

- that the content is AI-driven
- what kind of suggestion it is
- who or what it is for
- why XYPH thinks it is relevant
- what lawful next actions are available

without mistaking the suggestion for settled graph truth or a human decision.

### Hill 6: Let Agents Start Productive Without Shell Archaeology

When an agent starts work in a repo, it can:

- understand what is true
- understand what it is allowed to do
- retrieve the next best task or suggestion
- see blocking reasons in machine-readable form

without reconstructing the project from scattered CLI output and raw graph
queries.

### Hill 7: Make Agent Suggestions Consumable, Not Merely Emitted

When an agent proposes work, the suggestion should become a first-class queued
artifact that can be:

- reviewed by a human
- picked up by another agent
- accepted into the normal lifecycle
- rejected or marked stale with recorded rationale

## Product Principles

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

AI suggestions may recommend:

- dependency edges
- new quests
- quest shaping or splitting
- backlog promotions
- campaign or intent mappings
- review or settlement follow-ups
- graveyard reopen candidates

But every suggestion must still be visibly advisory until a lawful human or
agent action lowers it through the normal mutation path.

### 11. AI Must Be Explicitly Marked

AI-generated or AI-assisted content must never masquerade as ordinary product
copy or settled graph truth. XYPH should use a dedicated `[AI]` component
wherever AI presence needs to be recognized and explained.

### 12. Every Idea Enters The Same Lifecycle

Quest creation should not bypass governance just because it is initiated from a
nice page, by a human, or by an agent. Every new work idea enters through the
same lifecycle:

`suggested -> BACKLOG -> PLANNED -> READY -> IN_PROGRESS -> ...`

Whether the source is human or agent, creation should be modeled as suggestion
or intake into backlog, not as a secret privileged fast path.

### 13. "Ask The AI" Must Be An Explicit Job

If XYPH lets a user "ask the AI" for help, that request must become an explicit
job or suggestion artifact in the queue. It should be inspectable, targetable,
and explainable, not a hidden side channel.

### 14. Same Graph, Different Lenses

Humans and agents should consume the same graph truth through different lenses.
The human landing cockpit and the agent-native CLI should disagree in format,
not in reality.

## App Architecture

## Landing Page

The landing page is the cockpit. It is the operator's home surface.

Current top-level lanes:

1. `Now`
2. `Plan`
3. `Review`
4. `Settlement`
5. `Campaigns`
6. `Graveyard`

The landing page layout consists of:

- **Hero header**: product identity, current lane, observer, worldline
- **Breadcrumb line**: current location in the app
- **Lane rail**: top-level surfaces and their attention state
- **Worklist**: the primary scannable queue for the active lane
- **Inspector**: selected-item preview
- **Drawer / modals**: auxiliary surfaces, not the default home for core flows

Potential landing-page expansions that still fit the model:

- a `Suggestions` lane
- a `Now / Suggestions` mode
- a `Now / Live` mode for event-stream awareness

Landing-page responsibilities:

- orient the operator
- show freshness and attention
- surface AI suggestion jobs for human or agent pickup
- support lightweight scanning
- preview selected items
- provide quick actions where appropriate
- route into pages via `Enter`

Landing-page non-responsibilities:

- carrying every detail for every item forever
- making the inspector the permanent home for deep work
- pretending every lane is a wizard step

## Agent-Native Surface

The agent-native surface is not a TUI. It is the product experience embodied in
the agent-facing CLI and machine-oriented interaction layer.

Current homes:

- `xyph briefing`
- `xyph next`
- `xyph context`
- `xyph submissions`
- `xyph act`
- `xyph handoff`
- future suggestion/job queue reads and writes

Agent-surface responsibilities:

- orient a cold-start agent
- expose available work and suggestion jobs
- expose allowed actions and blocking reasons
- keep output structured and context-window efficient
- preserve auditability and graph-native handoff

Agent-surface non-responsibilities:

- inventing a second hidden workflow model
- bypassing governance or capability checks
- silently executing AI-suggested work without visible queueing or approval

## Drill-In Pages

Pressing `Enter` on a selected record opens a dedicated page. The page becomes
the primary surface for context and action.

Current page taxonomy:

### Quest Page

Purpose:

- full quest context
- comments
- claim / promote / reject / reopen
- review affordances when attached submission state makes them legal
- lineage and traceability context

### Submission / Review Page

Purpose:

- patchset chain
- reviews and reviewer reasoning
- approval / changes-requested / close / merge flows
- provenance and settlement relationship

### Governance Artifact Page

Purpose:

- comparison artifact detail
- collapse proposal detail
- attestation state
- execution readiness
- blocked / ready / stale reasoning
- settlement step progression

### Campaign Page

Purpose:

- strategic overview
- child quests
- campaign health
- recent activity
- dependency corridors

### Graveyard Quest Page

Purpose:

- why the work died
- who rejected it
- what it depended on
- whether reopening is still lawful or sensible

### Suggestion Page

Purpose:

- inspect one AI-generated suggestion in full context
- understand who or what it targets
- see the evidence, rationale, and explainability behind it
- accept, reject, comment on, or queue the suggestion for agent pickup when
  lawful

### Ask-AI Job Page

Purpose:

- inspect an explicit "ask the AI" job
- show what was requested
- show which agent or queue it targets
- show status, response, and next suggested actions
- make the request auditable instead of ephemeral

## Navigation Model

Navigation rules:

- `1`-`6`, `[` / `]`: move between landing lanes
- `Enter`: drill into selected item page
- `Esc` / `Backspace`: return to the prior page, usually the landing page
- breadcrumb under the header: always shows where the user is
- modal overlays should never erase location awareness

Example breadcrumbs:

- `Landing / Now / Recent Activity`
- `Landing / Plan / TRC-010`
- `Landing / Graveyard / G-021`
- `Landing / Settlement / collapse-proposal:abc123`

## Lane Definitions

### Now

Purpose:

- immediate operational awareness
- recent activity
- cross-surface action queue
- AI suggestion queue for human and agent pickup

Must answer:

- what changed?
- who changed it?
- what is already in motion?
- what should I look at next?
- which suggestion jobs are waiting for judgment or pickup?

### Suggestions

Purpose:

- advisory suggestions and explicit ask-AI jobs
- machine-targeted and human-targeted recommendation queues

Must answer:

- what suggestions exist?
- which are for humans vs agents?
- which are fresh, hot, blocked, stale, or already consumed?
- which can be accepted, queued, rejected, or commented on now?

### Live

`Live` is not necessarily a top-level lane, but XYPH should support a live mode
somewhere in the product.

Purpose:

- subscribe to graph mutations as they happen
- surface a live operational feed during active collaboration

Must answer:

- what just mutated?
- who wrote it?
- which lane or entity did it affect?

Design rule:

- live mode must remain clearly separate from settled history and from AI
  suggestion artifacts

### Plan

Purpose:

- the live quest surface
- ongoing and upcoming execution truth

Must answer:

- what is active?
- what is ready?
- what is backlog?
- what depends on what?

### Review

Purpose:

- submissions and review state

Must answer:

- what needs review?
- what is blocked in review?
- what was approved or sent back?

### Settlement

Purpose:

- comparison, attestation, collapse, and governed execution state

Must answer:

- what is ready for governance?
- what is stale?
- what is blocked?
- what can lawfully settle now?

### Campaigns

Purpose:

- strategic containers and progress

Must answer:

- which campaigns are moving?
- which campaigns are stalled?
- what is aging inside them?

### Graveyard

Purpose:

- dead, rejected, retired, or otherwise inactive work

Must answer:

- what died?
- why did it die?
- is there a pattern here?
- should something be reopened?

## Capability Matrix

| Surface | Primary job | Typical actions |
|---|---|---|
| Landing cockpit | triage, orientation, selection | switch lane, scan, quick preview, quick action, open page |
| Quest page | execute or redirect work | comment, claim, promote, reject, reopen, inspect lineage |
| Review page | make review decisions | approve, request changes, close, merge, comment |
| Settlement page | govern settlement | inspect comparison, attest, preview collapse, execute collapse when lawful |
| Campaign page | supervise strategic flow | inspect children, track activity, navigate to work |
| Graveyard page | recover or understand dead work | inspect rationale, lineage, reopen when lawful |
| Suggestion page | inspect and govern one AI suggestion | explain, accept, reject, comment, route to agent pickup |
| Agent-native CLI | orient and act efficiently | briefing, next, context, consume queue, act, handoff |
| Ask-AI job page | inspect one explicit AI request | explain, reroute, cancel, comment, consume result |

## AI Suggestions

AI suggestions are graph-native advisory artifacts that help humans and agents
notice likely useful next actions before someone performs a lawful mutation.

They are not implicit automation. They are explainable recommendations.

### Suggestion Families

Initial high-value suggestion families include:

- recommend a dependency edge
- recommend a new quest from observed structure or repeated activity
- recommend promoting a backlog item
- recommend a campaign or intent association
- recommend a review or settlement follow-up
- recommend reopening a graveyarded item

### Targeting

Suggestions may target:

- a human operator
- a specific agent
- any eligible agent queue consumer

If a suggestion is agent-targeted, it should be visible in the XYPH human
surface and also lower to a machine-consumable queue/job surface so agents can
pick it up through the canonical control plane.

### Queueing

Suggestions are not just annotations. They should be able to live in a queue
that either humans or agents can consume.

Examples:

- a human-facing suggestion queue in the landing surface
- an agent-facing recommendation queue in `briefing` / `next`
- explicit ask-AI jobs that wait for agent pickup

### States

Suggestions should move through a visible lifecycle such as:

- `suggested`
- `queued`
- `claimed`
- `accepted`
- `rejected`
- `stale`

The exact storage model can evolve, but the human surface must make the state
obvious.

### Quest Creation

Humans and agents should both be able to propose new quests, but creation must
flow through the same intake model. The product should present "create quest"
as:

- a suggestion or intake action
- a backlog addition
- optionally an ask-AI-assisted drafting flow

It should not be presented as a privileged bypass around backlog/governance.

### Ask-The-AI Jobs

XYPH should support explicit "ask the AI" jobs that become queue artifacts.

Typical uses:

- recommend dependencies
- recommend quests
- recommend a backlog promotion
- explain a blocked review or settlement artifact
- suggest a graveyard reopen

The important product rule is that "ask the AI" creates a visible job and
result trail. It is not a hidden side conversation.

### Human Expectations

A sponsor user looking at a suggestion should be able to tell:

- what is being suggested
- why it is being suggested
- what evidence or heuristics support it
- whether it is for a human or an agent
- what happens if it is accepted

### Agent Expectations

An agent consuming suggestion jobs should be able to tell:

- the suggestion type
- the target entity or entities
- the rationale and supporting evidence
- whether this is merely advisory or already approved for execution

## `[AI]` Transparency Component

XYPH should define a dedicated `[AI]` component inspired by Carbon's AI label,
adapted for a terminal and graph-native workflow.

Purpose:

- clearly mark AI-generated or AI-assisted content
- provide a consistent visual anchor for AI presence
- act as the trigger for explainability, not as the trigger for an AI action

### Variants

#### Broad `[AI]`

Use when a whole area is AI-driven, such as:

- a suggestion queue mode
- a suggestion page
- a whole section of recommendations

#### Inline `[AI]`

Use when a single row, card, field, or sentence is AI-driven.

### Placement

In terminal form, the default placement rules should be:

- page or pane header: upper-right / trailing edge
- worklist row with whole-row AI presence: far left before the row title
- single field or sentence with AI presence: inline to the left of the text
- grouped icon/action clusters: `[AI]` comes first and remains visually
  distinct from action controls

### Behavior

`[AI]` is not decorative and not an action button for "generate" or
"regenerate." It is the pathway to explainability.

Activating `[AI]` should open an explainability popover or modal that explains:

- overview of what the AI did
- supporting details or signals used
- artifacts/resources/provenance when available
- additional actions such as accept, reject, or revert when the surrounding
  workflow allows them
- for queue items, whether the item is human-targeted, agent-targeted, or both

### Visibility Levels

Use focused `[AI]` labeling when:

- the user needs to distinguish one AI instance from neighboring non-AI content
- the user may act on one suggestion instance at a time

Use broad `[AI]` labeling when:

- the entire queue, section, or page is AI-driven
- individual instance-level explainability is not the primary need

Use both when:

- a broad AI-generated section contains focused AI-generated rows or fields
- users need both section-level and item-level explainability

### Override And Revert

If a user materially edits AI-suggested content, the AI presence styling should
clear for the edited content and a distinct revert affordance may appear to
restore the original suggestion. The `[AI]` marker should describe present AI
content, not historical provenance only.

## Attention Model

Attention is a product feature, not a styling flourish.

### Fresh

New since the current observer last saw the item or lane.

UI expectations:

- lightweight dot or count
- disappears once actually visited or explicitly marked seen

### Hot

Needs human judgment now.

UI expectations:

- persistent badge until resolved
- explicit explanation in the inspector or page
- should survive casual visitation

### Blocked

Cannot progress because a prerequisite is missing.

UI expectations:

- visible reason
- clear next missing action or artifact

### Historical

Useful for audit and context, but not an active attention demand.

UI expectations:

- visible in recent activity and pages
- not promoted into urgent badges

AI suggestions can participate in this model, but the `[AI]` marker is separate
from attention. A suggestion can be `[AI]` and also be fresh, hot, blocked, or
historical.

Agent-targeted suggestion jobs can also be:

- **claimable**: any eligible agent may pick this up
- **reserved**: targeted to one agent or one queue
- **awaiting-human**: agent work is paused pending human judgment

Those states should not be collapsed into ordinary freshness.

## Stepper Use

BIJOU stepper is appropriate for **bounded governance flows**, not for global
navigation.

Good uses:

- `compare -> attest -> ready -> collapse -> executed`
- `submitted -> review -> approved/changes requested -> settled`

Bad uses:

- turning the top-level XYPH lanes into a wizard
- pretending the whole app is one linear process

## Contextual Help

Help must be generated from the same control model as the footer and page
actions. It should:

- appear as an in-app modal
- be scrollable when needed
- prioritize the controls relevant to the current focused area
- distinguish global controls from local actions

It should not replace the current page with a generic toolkit screen.

## Design-System Requirements

XYPH should sit on BIJOU while defining its own semantic product tokens and
interaction rules.

Requirements:

- lane-scoped accents
- semantic tones for fresh / hot / blocked / success / graveyard
- consistent page headers and breadcrumbs
- consistent modal and drawer treatment
- scroll/overflow behavior that is explicit but not noisy
- page-local action treatment that reads as intentional, not improvised
- a stable `[AI]` component with broad and inline variants
- consistent explainability modal/popover behavior for AI-marked content

The rule is: BIJOU provides primitives; XYPH provides product meaning.

## Playback Cadence

To adapt IBM Design Thinking honestly, XYPH human-surface work should be reviewed through
playbacks rather than only through code completion.

Each substantial XYPH product slice should be demoable against the real graph and
evaluated against these questions:

1. Can a sponsor user orient faster than before?
2. Can they explain why an item is hot, blocked, or fresh?
3. Can they move from landing to page to lawful action without confusion?
4. Is the page better than cramming more into the inspector?
5. Did the slice reduce ambiguity, or only add chrome?
6. Can both a human and an agent explain what the next lawful action is?

For agent-native slices, use the same playback discipline with sponsor agents:

1. Could a cold-start agent orient faster than before?
2. Could it distinguish truth, suggestion, and authority?
3. Could it consume a queue without shell archaeology?
4. Could it explain why it acted, or why it refused to act?

## Observe / Reflect / Make Loop

Every XYPH product slice should follow this loop:

### Observe

- watch real operators use the app
- collect screenshots, confusion points, and task failures
- look at real graph-backed states, not idealized mocks only

### Reflect

- identify where the current design violates the hills or product principles
- decide whether the answer is a new page, a clearer action, a better cue, or
  less UI

### Make

- land the smallest slice that changes the operator outcome
- verify it in the app, not only in code
- capture the updated design truth here when the product model changes

## What We Should Not Do

- Do not treat the landing cockpit as the permanent home for all detail and all
  actions.
- Do not keep inventing new panes when a real page is required.
- Do not overload freshness badges with urgency semantics.
- Do not hide Graveyard because it feels less flattering than active work.
- Do not use BIJOU primitives without defining XYPH product meaning on top.
- Do not ship deep interaction changes without updating this document when the
  product model changes.

## Immediate Design Program

The next design-led product slices should follow this order:

1. finish the landing-page vs drill-in-page split
2. add dedicated page types for review, settlement, and suggestion artifacts
3. define the agent-native sponsor-actor model in the same product language as
   the human surface
4. add AI suggestion queues for human and agent pickup
5. add the `[AI]` transparency component and explainability flow
6. add explicit ask-AI jobs and suggestion-backed quest creation
7. add live graph-feed mode driven by graph mutation subscription
8. tighten contextual action models on those pages and CLI flows
9. deepen the recent-activity and attention-routing model
10. refine the semantic token layer for XYPH on top of BIJOU

This keeps XYPH from becoming a forever-dashboard and moves it toward a real
operator application with destinations, context, and governed action.
