# Playbacks

XYPH uses playbacks to keep product changes grounded in real operator outcomes
instead of equating "code landed" with "design improved."

## Playback Cadence

Each substantial XYPH product slice should be demoable against the real graph
and reviewed through a playback, not just code completion.

The slice is not done because it compiles. It is done when the relevant sponsor
actor can perform their job better and that improvement is legible in the app
or CLI.

Each substantial cycle should normally have:

- one human playback
- one agent playback

Those are not redundant. The point is to verify that the same graph truth and
governance model remain usable through both lenses.

Playbacks should be treated as a formal gate in the cycle, not as optional
cleanup after implementation.

## What A Playback Measures

Playbacks are where XYPH measures progress against the declared hills through
the perspectives of the relevant sponsor actors.

They are not primarily measuring "semantic" versus "surface" progress. Those
are useful checkpoints during implementation, but the playback question is more
important:

- did this cycle improve the intended hill?
- for which sponsor actor?
- under what real graph-backed scenario?

That means every substantial playback should be grounded in:

- the cycle's sponsor actors
- the cycle's hill or hills
- one or more real graph-backed cases or transcripts

The output should say whether the cycle materially improved the target outcome,
not just whether the implementation exists.

## Relationship To Checkpoints

XYPH cycles usually move through four checkpoints:

1. doctrine
2. spec
3. semantic
4. surface

Playbacks fit on top of those checkpoints rather than replacing them.

- the **semantic checkpoint** should usually be tested first through an agent
  playback, because that is where missing building blocks and hidden ambiguity
  show up earliest
- the **surface checkpoint** should usually be tested through a human playback,
  because that is where judgment, orientation, and explainability either become
  legible or fail

The same cycle can have both semantic and surface progress while still failing
the playback if it did not actually move the hill for the sponsor actors it was
meant to help.

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
- decide whether the human and agent surfaces are still aligned, or whether one
  of them is papering over missing shared semantics

### Make

- land the smallest slice that changes the operator outcome
- prefer shared semantic packets and agent-native seams first, then build the
  human-facing page or TUI expression on top of them
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
- a statement of which hill was tested and whether it moved materially
- a decision about whether the slice preserved the design invariants
- a decision about whether the human and agent lenses still agree about what is
  true, what is allowed, and what should happen next
- explicit next changes, not vague "polish later"
- documentation updates when the product model changed

## After A Cycle Closes

The playback/retrospective output does not jump straight into the next design
doc.

After a cycle is merged, released when appropriate, and closed, XYPH resets in
this order:

1. reconcile the graph backlog
2. add work discovered during the cycle
3. add retrospective fallout
4. add COOL IDEAS™ worth preserving
5. decide whether the next cycle is another product cycle or a debt-reduction /
   simplification cycle

Only after that reconciliation should the next cycle design docs start.

This keeps XYPH from treating milestone output as side-channel memory instead
of graph-visible plan state.

## Design Rule

If a slice cannot be demonstrated against a real graph-backed state and judged
through the sponsor-actor and hill model, it is not ready to be called a design
success.

If the slice only works cleanly from one lens, it is not finished design. It is
at best a partial surface waiting for alignment.
