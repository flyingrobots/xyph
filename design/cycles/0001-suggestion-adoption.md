# 0001: Suggestion Adoption and Explainability

## Cycle Type

Feature vertical

This cycle completes the next meaningful part of the Suggestions vertical by
making AI suggestions adoptable into governed work instead of merely visible in
queues and pages.

## Graph Anchor

- Work item: `task:suggestion-adoption`

## Why This Cycle Exists

XYPH can already:

- emit suggestion artifacts
- queue explicit ask-AI jobs
- show suggestions in the landing experience
- let agents surface suggestion packets

What it still cannot do well is the part that matters most: turn a good
suggestion into lawful plan reality without losing provenance or confusing AI
advice for settled truth.

## Sponsor Actors

### Human sponsor actor

**Program steward**

Needs to review a suggestion, understand why it exists, and adopt or dismiss it
without leaving a provenance hole or bypassing the normal quest/governance
lifecycle.

### Agent sponsor actor

**Causal implementation agent**

Needs to emit and consume suggestion artifacts through the same graph-visible
channel humans use, and needs clear machine-readable signals about what action
is expected next.

## Outcome Hills

This cycle primarily advances:

- **Hill 5**: Make AI Suggestions Transparent And Useful
- **Hill 7**: Make Agent Suggestions Consumable, Not Merely Emitted

## Invariants

This cycle must preserve:

- The graph is the plan. Suggestion adoption must produce graph-native work
  artifacts, not a hidden side-channel state change.
- Suggestions are advisory, not sovereign. Adoption must not bypass the lawful
  lifecycle for quests, proposals, or governance artifacts.
- Provenance must stay inspectable. Every adopted or dismissed suggestion needs
  visible linkage and rationale.
- Humans and agents share one reality. Suggestion state in the TUI and the CLI
  must describe the same artifacts and the same next-action model.
- Hexagonal architecture. Suggestion handling must lower through ports and
  domain services, not TUI-specific shortcuts.

## Scope

In scope:

- adopt a suggestion into an explicit governed work shape such as a quest or proposal
- dismiss a suggestion with rationale
- mark a suggestion as superseded when a better suggestion or adopted artifact
  replaces it
- render a dedicated `[AI]` marker and explainability surface in the TUI
- show suggestion provenance, source, target, and adoption state on suggestion
  pages
- surface suggestion follow-up semantics consistently in both human and agent
  flows

Out of scope:

- BIJOU v4 uplift
- upstream BIJOU component work
- live graph subscription mode
- automated suggestion-learning loops
- suggestion ranking based on historical acceptance

## Acceptance-Test Plan

Before implementation is considered done, executable tests should pin these
behaviors:

1. A suggestion can be adopted into an explicit graph-native work shape without
   bypassing the normal lifecycle.
2. Adoption records visible provenance from `suggestion:*` to the adopted
   artifact.
3. A suggestion can be dismissed with recorded rationale and remains explorable
   as a suggestion artifact rather than becoming graveyarded work.
4. A suggestion can be marked superseded and linked to the replacing artifact or
   suggestion.
5. The TUI shows a stable `[AI]` marker on AI-originated suggestion rows/pages.
6. The explainability surface answers:
   - why this was suggested
   - who or what produced it
   - whether it came from explicit ask-AI or spontaneous agent observation
   - what the lawful next actions are
7. Agent-facing packets expose the same adoption/dismissal/supersession semantics.

## Implementation Notes

- Prefer turning adopted suggestions into inbox/backlog/governance artifacts
  through existing lawful write paths rather than inventing a special-case
  shortcut.
- Keep suggestion state explicit. Do not overload dismissal, supersession, and
  adoption into one catch-all terminal status.
- The `[AI]` marker is an explainability trigger, not an action trigger.

## Playback Questions

After the cycle lands, ask:

1. Can a human tell whether a suggestion is worth adopting without mistaking it
   for settled truth?
2. Can a human adopt or dismiss the suggestion without leaving the page model?
3. Can an agent explain why it emitted the suggestion and what should happen
   next?
4. Did the cycle make suggestions operational, or only better decorated?

## Exit Criteria

This cycle closes when:

- the design intent is reflected in executable acceptance tests
- suggestions can be adopted, dismissed, and superseded with provenance
- `[AI]` explainability is visible in the TUI
- the CLI and TUI speak the same suggestion state model
- the README reflects any user-visible command or page changes that actually
  landed
