# 0002: Agent CLI Hardening

## Cycle Type

Feature vertical

This cycle raises the agent-native CLI to the same product standard as the TUI
by treating the CLI as a real interaction surface, not just a transport for
structured data.

## Graph Anchor

- Work item: `task:agent-cli-hardening`

## Why This Cycle Exists

XYPH's TUI has been redesigned through sponsor actors, hills, attention states,
landing/page distinctions, and contextual help. The CLI has the right semantic
packets, but not yet the same degree of designed interaction.

The agent surface already speaks truthful semantics. What it still needs is a
clear experience model for:

- cold-start orientation
- work selection
- full-context drill-in
- lawful action
- deferral, escalation, and handoff

Without that, the CLI remains more correct than coherent.

## Sponsor Actors

### Primary sponsor actor

**Cold-Start Worker Agent**

Needs to enter the repo, orient, choose work, understand blockers, and act
without shell archaeology or command-by-command guesswork.

### Secondary sponsor actors

**Queue-Consuming Agent**

Needs to consume explicit tasks, suggestions, and governance follow-ups with
clear machine-readable reasons for claim, defer, reject, or escalate.

**Reviewing Agent**

Needs to understand what is reviewable, what evidence is missing, and which
judgments remain human-bound.

## Outcome Hill

**As a cold-start or queue-consuming agent, I can use XYPH as my operating
interface instead of reconstructing the repo from raw shell output, because the
CLI gives me a designed path from orientation to action to handoff.**

## Invariants

This cycle must preserve:

- The graph is the plan. The CLI must describe graph truth, not invent hidden
  workflow state.
- Human and agent surfaces share one reality. The CLI can be more concise or
  more structured than the TUI, but it must not describe a different world.
- Governance remains explicit. Human-only boundaries must stay visible and
  machine-readable.
- Hexagonal architecture. CLI behavior must keep lowering through shared domain
  services and action kernels.
- Boring defaults. Human-readable CLI output should be scannable and direct,
  not clever.

## Scope

In scope:

- define the agent CLI interaction model
- make `briefing`, `next`, `context`, `act`, and `handoff` read like one
  coherent surface
- make human-readable output as intentional as `--json` output
- add explicit defer / escalate / ask-for-help semantics where lawful
- make contextual help and command discoverability consistent across the agent
  commands

Out of scope:

- BIJOU work
- TUI redesign
- replacing the canonical `xyph api` control plane
- agent autonomy changes that bypass policy or governance boundaries

## Acceptance-Test Plan

Before implementation is considered done, executable tests should pin these
behaviors:

1. `briefing` gives a cold-start agent enough context to understand what is
   true, hot, blocked, and assigned.
2. `next` returns candidates with enough structured reasoning that an agent can
   pick one without separate archaeology.
3. `context <id>` acts as the CLI equivalent of a real item page, with
   requirements, evidence, blockers, next lawful actions, and provenance cues.
4. `act` refusals and dry-runs reuse the same semantic fields as the read side.
5. `handoff` closes the loop with durable graph-native state and does not feel
   bolted on.
6. Human-readable output across these commands is contextually legible and not
   meaningfully weaker than the machine-readable contract.

## Implementation Notes

- Treat the CLI as a first-class interaction model, not only a JSON surface.
- Reuse one vocabulary across human-readable and machine-readable outputs.
- Prefer deeper coherence over adding more commands.

## Playback Questions

After the cycle lands, ask:

1. Could a cold-start agent become useful through XYPH alone?
2. Could it tell what it should do next and why?
3. Could it tell when a human was required without ambiguity?
4. Did the CLI become more product-like, or just more verbose?

## Exit Criteria

This cycle closes when:

- the agent CLI has an explicit interaction model in the design and protocol
- the shared commands read as one surface in both text and JSONL modes
- defer/escalate/handoff semantics are explicit where lawful
- the acceptance suite pins the new behavior
