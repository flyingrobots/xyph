# Playbacks

XYPH uses playbacks to keep product changes grounded in real operator outcomes
instead of equating "code landed" with "design improved."

## Playback Cadence

Each substantial XYPH product slice should be demoable against the real graph
and reviewed through a playback, not just code completion.

The slice is not done because it compiles. It is done when the relevant sponsor
actor can perform their job better and that improvement is legible in the app
or CLI.

## Human Playback Questions

For human-surface slices, ask:

1. Can a sponsor user orient faster than before?
2. Can they explain why an item is hot, blocked, or fresh?
3. Can they move from landing to page to lawful action without confusion?
4. Is the page better than cramming more into the inspector?
5. Did the slice reduce ambiguity, or only add chrome?
6. Can both a human and an agent explain what the next lawful action is?
7. Did the slice preserve the XYPH invariants instead of smoothing them away?

## Agent Playback Questions

For agent-native slices, ask:

1. Could a cold-start agent orient faster than before?
2. Could it distinguish truth, suggestion, and authority?
3. Could it consume a queue without shell archaeology?
4. Could it explain why it acted, or why it refused to act?
5. Did the slice preserve graph truth, governance, and provenance instead of
   hiding them?

## Observe / Reflect / Make

Every XYPH design slice should follow this loop.

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
- verify it in the app or CLI, not only in code
- capture the updated design truth in the design corpus when the product model
  changes

## Playback Inputs

Useful playback inputs include:

- screenshots and short recordings from real usage
- command transcripts for agent-native flows
- examples of confusion, refusal, or misrouted attention
- before/after comparisons on the same graph-backed scenario

## Playback Outputs

A good playback should end with:

- a decision about whether the slice actually improved the relevant sponsor
  actor outcome
- a decision about whether the slice preserved the design invariants
- explicit next changes, not vague "polish later"
- documentation updates when the product model changed

## After A Milestone Closes

The playback/retrospective output does not jump straight into the next design
doc.

After a milestone is merged, released, and tagged, XYPH resets in this order:

1. reconcile the graph backlog
2. add work discovered during the milestone
3. add retrospective fallout
4. add COOL IDEAS™ worth preserving
5. decide whether the next cycle is a new milestone or a debt-reduction /
   simplification cycle

Only after that reconciliation should the next milestone design docs start.

This keeps XYPH from treating milestone output as side-channel memory instead
of graph-visible plan state.

## Design Rule

If a slice cannot be demonstrated against a real graph-backed state and judged
through the sponsor-actor and hill model, it is not ready to be called a design
success.
