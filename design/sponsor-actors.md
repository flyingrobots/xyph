# Sponsor Actors

XYPH uses IBM Design Thinking's sponsor-user idea, but expands it into
**sponsor actors** so the agent-native CLI is designed with the same rigor as
the human-facing app.

## Human Sponsor Users

### 1. Operator-Supervisor

This is the human who opens XYPH to answer:

- what is happening right now?
- what is blocked?
- what needs my judgment?
- where should I intervene?

Primary success condition:

- they can orient within seconds and move from awareness to action without
  dropping to raw JSON or shell archaeology, including when the next thing to
  inspect is an AI-generated suggestion rather than a human-authored artifact

### 2. Governance Reviewer

This is the human who must inspect submissions, comparisons, attestations, and
collapse proposals before live truth changes.

Primary success condition:

- they can tell what is ready, what is blocked, and what evidence is missing
  before approving settlement

### 3. Program Steward

This is the human who needs to understand plan health across campaigns, dead
work, graveyard patterns, and flow quality.

Primary success condition:

- they can distinguish live strategic motion from churn, abandonment, or
  governance debt

### 4. Collaborating Human Builder

This is the human who works alongside agents and needs a trustworthy surface
for claiming, commenting, promoting, rejecting, reopening, and reviewing work.

Primary success condition:

- they can act directly from the right page with the right context, without
  memorizing hidden CLI rituals, and can distinguish AI suggestions from
  human-authored truth at a glance

## Agent Sponsor Actors

For the agent-native layer, apply the same IBM discipline but replace "user"
with "agent": design for representative agent jobs, not for an imaginary
generic machine consumer.

### 1. Cold-Start Worker Agent

This is the agent that enters a repo cold and needs to become useful quickly.

Primary success condition:

- it can orient from XYPH alone, identify true work, understand what is
  allowed, and start acting without spelunking raw files, running redundant
  shell commands, or reverse-engineering graph state

### 2. Queue-Consuming Agent

This is the agent that consumes explicit jobs, recommendations, or suggestions
from a queue instead of improvising work selection every time.

Primary success condition:

- it can pull the next best suggestion or task, understand why it was offered,
  and decide whether to claim, defer, or reject it with machine-readable
  reasons

### 3. Reviewing Agent

This is the agent that reviews submissions, comments on work, or assists with
settlement-related judgment without exceeding its authority.

Primary success condition:

- it can tell what it is allowed to review, what evidence is missing, and when
  a human is still required

### 4. Recommending Agent

This is the agent that proposes structure instead of mutating it directly.

Primary success conditions:

- it can emit high-quality, explainable suggestions for quests, dependencies,
  promotions, and follow-up work without those suggestions being mistaken for
  settled graph truth
- it can emit those suggestions either opportunistically while already working
  or in response to an explicit suggestion or job request, without needing a
  privileged special mode

## Design Rule

Any new page, CLI command, suggestion queue, or governance flow should be
explainable in terms of at least one sponsor actor. If a slice cannot say who
it improves and how success is measured, it is probably design drift rather
than product progress.
