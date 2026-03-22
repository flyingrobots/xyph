# XYPH Product Design

**Status:** Current source of truth for XYPH's human-facing product design.  
**Scope:** XYPH landing page, drill-in pages, attention model, page taxonomy,
navigation, and design-review practice.  
**Relationship to architecture:** `docs/canonical/ARCHITECTURE.md` remains the
technical architecture source of truth. This document is the product and
experience source of truth for the human surface built on top of that
architecture.

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
human surface, using the parts that fit this product best:

- **Sponsor Users** to keep the app anchored in real operator needs
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

It exists so a human can:

- understand what changed, who did it, and why it matters
- see the live plan and its speculative alternatives honestly
- inspect and govern review/attestation/settlement state
- take lawful action with full context
- recover dead or rejected work without losing causal history

XYPH is **not**:

- a generic terminal dashboard
- a second workflow engine separate from the graph
- a decorative history browser
- a branch browser with better branding

The graph is still the plan. XYPH is the place where a human can perceive,
judge, and act on that plan.

## Sponsor Users

IBM Design Thinking starts by designing for real users with specific outcomes.
For XYPH, the sponsor-user set is:

### 1. The Operator-Supervisor

The human who opens XYPH to answer:

- what is happening right now?
- what is blocked?
- what needs my judgment?
- where should I intervene?

Primary success condition:

- can orient within seconds and move from awareness to action without dropping
  to raw JSON or shell archaeology

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
  to memorize hidden CLI rituals

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

## Product Principles

### 1. Landing For Triage, Pages For Judgment

The cockpit is the landing page, not the whole app.

Use the landing page for:

- orientation
- queue scanning
- freshness and attention routing
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

Landing-page responsibilities:

- orient the operator
- show freshness and attention
- support lightweight scanning
- preview selected items
- provide quick actions where appropriate
- route into pages via `Enter`

Landing-page non-responsibilities:

- carrying every detail for every item forever
- making the inspector the permanent home for deep work
- pretending every lane is a wizard step

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

Must answer:

- what changed?
- who changed it?
- what is already in motion?
- what should I look at next?

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
2. add dedicated page types for review and settlement artifacts
3. tighten contextual action models on those pages
4. deepen the recent-activity and attention-routing model
5. refine the semantic token layer for XYPH on top of BIJOU

This keeps XYPH from becoming a forever-dashboard and moves it toward a real
operator application with destinations, context, and governed action.
