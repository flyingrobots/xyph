# Hills

These are the current product hills for XYPH. A hill is an outcome, not a
feature checklist.

## Hill 1: Orient In Under 30 Seconds

When a sponsor user opens XYPH, they can tell:

- what changed recently
- who changed it
- what lane needs attention
- which next item deserves inspection

without reading raw graph data or leaving the landing page.

## Hill 2: Move From Awareness To Lawful Action Without Context Loss

From any highlighted item on the landing page, the operator can drill into a
real item page and perform the next lawful action with all needed context in
view.

## Hill 3: Make Governance Legible

Review and settlement must feel like intentional governance flows, not a pile
of disconnected artifacts. The operator should be able to tell:

- where an item sits in the flow
- what is blocking it
- what evidence is missing
- who is expected to act next

## Hill 4: Keep Dead Work Visible And Recoverable

Rejected or retired work must remain explorable through Graveyard. The operator
should be able to understand why it died, what it depended on, and whether it
should be reopened.

## Hill 5: Make AI Suggestions Transparent And Useful

When XYPH shows AI-generated suggestions, the operator should be able to tell:

- that the content is AI-driven
- what kind of suggestion it is
- who or what it is for
- why XYPH thinks it is relevant
- what lawful next actions are available

without mistaking the suggestion for settled graph truth or a human decision.

## Hill 6: Let Agents Start Productive Without Shell Archaeology

When an agent starts work in a repo, it can:

- understand what is true
- understand what it is allowed to do
- retrieve the next best task or suggestion
- see blocking reasons in machine-readable form

without reconstructing the project from scattered CLI output and raw graph
queries.

## Hill 7: Make Agent Suggestions Consumable, Not Merely Emitted

When an agent proposes work, the suggestion should become a first-class queued
artifact that can be:

- reviewed by a human
- picked up by another agent
- accepted into the normal lifecycle
- rejected or marked stale with recorded rationale

This hill applies both to:

- explicit ask-AI jobs or suggestion requests
- spontaneous agent-originated suggestions discovered during ordinary work

## Selected Vertical Program

The current active vertical is the **Suggestions adoption vertical**.

### Human Vertical: Hill 5

Make AI suggestions transparent and useful by letting a human review, explain,
adopt, dismiss, or supersede a suggestion without mistaking it for settled
truth.

### Agent Vertical: Hill 7

Make agent suggestions consumable by ensuring they become first-class graph
artifacts that can be picked up, reviewed, and lawfully adopted into the same
lifecycle as any other idea.

This vertical comes after the earlier Hill 3 / Hill 6 work because governance
pages and agent semantic packets are already strong enough to carry suggestions
without turning them into a side-channel.

## Next Vertical After Suggestions

The next follow-on vertical should be **Agent CLI hardening**:

- deepen **Hill 6** in implementation, not just doctrine
- bring the human-readable CLI experience up to the same product standard as the
  TUI
- make `briefing`, `next`, `context`, `act`, and `handoff` feel like one
  coherent operating interface
