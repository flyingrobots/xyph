# 0021: Principal Capability Model

## Cycle Type

Design-first doctrine and spec cycle

This cycle turns the newly accepted authority direction into an explicit,
bounded slice before implementation work starts bending around it.

## Status

Halted before the spec checkpoint on 2026-03-31.

The authority direction remains valid, but this cycle started at the wrong
time. XYPH's read architecture and graph-debugging posture need a harder pivot
first: observer/worldline-native reads, substrate-honest debugging, and
removal of `GraphContext` as the default read seam now take priority.

## Graph Anchor

- Work item: `task:principal-capability-model`

## Why This Cycle Exists

XYPH's current doctrine is already close to the right shape:

- principal
- observer profile
- effective capability grant

But the product has not yet fully committed to one authority model for all
principals. The recent workflow-profile discussion made the missing boundary
obvious: XYPH should not add programmable workflow control before it can answer
who is allowed to change that control surface, how delegation works, and how
those decisions stay attributable and inspectable.

This cycle makes that model explicit.

It also reframes "human sovereignty" into the more precise posture we just
accepted:

- one principal-general capability model
- human-reserved capabilities as the current default reservation posture
- explicit, governed delegation instead of folklore or special casing

## Sponsor Actors

### Primary sponsor actor

**Operator-Supervisor**

Needs XYPH to explain who may do what, why a command is allowed or blocked, and
which powers are delegated versus constitutionally reserved.

### Secondary sponsor actor

**Cold-Start Worker Agent**

Needs the same authority truth the human sees, without a parallel permission
story or hidden human-only workflow folklore.

## Outcome Hill

**As a principal interacting with XYPH, I can understand and eventually rely on
one explicit capability model that applies across humans, agents, services, and
future institutional principals, while current human-reserved powers remain
visible as default policy reservations rather than hardcoded metaphysics.**

## Invariants

This cycle must preserve:

- The graph is the plan.
- Observer profiles do not grant authority by existing.
- Capability resolution remains principal-general.
- Human-reserved powers are explicit default reservations inside the shared
  model, not a separate hidden permission system.
- Constitutional constraints remain hard boundaries unless explicitly changed
  by doctrine.
- Workflow programmability must not outrun capability and delegation truth.

## Scope

In scope:

- define the principal-general authority model for XYPH
- define the capability-resolution inputs and outputs clearly enough to build
  against
- identify the first capability classes that matter to workflow and governance
- define the default human-reserved reservation posture as policy/doctrine, not
  ontology
- define the delegation contract needed before workflow profiles become
  programmable
- define the acceptance-spec checkpoints for the implementation follow-on

Out of scope:

- full implementation of the capability engine
- full workflow-profile programmability
- replay/governed-observer due-process flows beyond what this cycle must name
- a complete RBAC or org-chart product
- replacing the constitution in this slice

## Acceptance-Test Plan

### Checkpoint 1: One authority model

1. the control plane resolves capability through one model for human, agent,
   service, and future institutional principals
2. the same denied action shape can explain principal, observer, policy, or
   constitutional blockers without branching into separate human and agent
   systems

### Checkpoint 2: Observer is not authority

3. changing observer profile alone does not grant mutation authority
4. the effective capability grant output makes the distinction between
   perception and authority legible

### Checkpoint 3: Default reservation posture

5. default human-reserved capabilities are explicit and inspectable rather than
   implied by a hidden admin bit
6. reservation posture is expressible as policy/doctrine, not a second
   permission ontology

### Checkpoint 4: Delegation contract

7. delegated capability is scoped, attributable, and revocable
8. workflow/profile control can name the required capability class instead of
   assuming "human only" or "admin"

### Checkpoint 5: Regression safety

9. focused acceptance and control-plane tests stay green
10. `npx tsc --noEmit` passes
11. `npm test` passes once the implementation slice lands

## Implementation Notes

- Start from the existing `principal + observer + effective capability grant`
  spine already described in canonical docs.
- Keep the engine principal-general; reserve capabilities through doctrine or
  policy, not by hardwiring a separate human permission model.
- Build agent/control-plane semantics first, then human-facing explanation and
  configuration surfaces.
- Treat workflow-profile editing as a dependent slice, not part of this one.

## Playback Questions

1. Can a human operator tell why an action is allowed, denied, or reserved?
2. Can an agent tell the same story without a different hidden authority model?
3. Did we replace vague "admin" or "human-only" folklore with explicit
   capability truth?
4. Did we preserve constitutional clarity while making future delegation
   possible?

## Exit Criteria

This cycle closes when:

- the doctrine clearly defines a principal-general capability model
- default human-reserved powers are framed as explicit reservations inside that
  model
- the acceptance-spec checkpoints are concrete enough to implement against
- the follow-on implementation slice for capability resolution and delegated
  workflow control is unambiguous
