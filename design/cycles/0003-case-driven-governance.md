# 0003: Case-Driven Governance

## Cycle Type

Feature vertical

This cycle introduces the first governed case flow for shape-changing matters so
humans and agents can coordinate on one case file instead of trading suggestions
and comments without a shared decision spine.

## Graph Anchor

- Work item: `task:case-driven-governance`

## Why This Cycle Exists

XYPH now has:

- suggestions
- governance pages
- agent-native `briefing`, `next`, `context`, `act`, and `handoff`
- a clearer product-loop doctrine for shape-changing decisions

What it does not yet have is the missing middle:

- one explicit case artifact
- agent-prepared briefs attached to that case
- one explicit human decision that can compile into governed follow-on work

Without that spine, shape-changing work is still too easy to route through ad
hoc comments, one-off suggestions, or implicit human memory.

## Sponsor Actors

### Primary sponsor actor

**Cold-Start Worker Agent**

Needs to discover open governed cases, understand what judgment is being
prepared, inspect the current evidence and options, and prepare a durable brief
without shell archaeology.

### Secondary sponsor actors

**Operator-Supervisor**

Needs to review a prepared case with provenance, alternatives, and explicit
decision framing instead of reading disconnected AI suggestions or informal
comments.

**Reviewing Agent**

Needs to contribute recommendation or alternative briefs without laundering
authority or bypassing human judgment.

## Outcome Hill

**As an agent or human handling a shape-changing matter, I can work through one
governed case with durable briefs, explicit judgment framing, and linked
follow-on work instead of piecing the decision together from side-channel
artifacts.**

## Invariants

This cycle must preserve:

- The graph is the plan. Cases, briefs, and decisions must be graph-backed or
  graph-derived, not view-local shadows.
- This is the shape-governance loop, not the universal workflow for routine
  task execution.
- Off-graph observations are valid inputs only after they are reified with
  provenance and uncertainty.
- Existing work primitives should carry follow-on execution by default.
- Human judgment remains the governing authority for shape-changing decisions.
- Agent-first implementation is the default pressure, but human explainability
  remains the legibility bar.
- Derived projections such as readiness or staleness should stay derived until
  policy or queue work proves they need durable identity.

## Scope

In scope:

- represent the first durable `case` and `brief` artifact shape
- surface open cases in `briefing` and `next`
- make `context case:*` act like a true item page for agents
- allow agents to prepare recommendation briefs through `act`
- pin the first end-to-end case flow in acceptance tests

Out of scope for this cycle:

- a dedicated TUI lane for cases
- quorum or voting machinery beyond what one sharp slice needs
- policy/doctrine change workflows
- mandatory worldlines or braids on every option
- automatic application of human decisions
- a new execution noun unless existing work units truly cannot carry the work

## Acceptance-Test Plan

This cycle should be implemented in checkpoints, but the first executable spec
must pin the agent path first.

### Checkpoint 1: Agent-first case preparation

1. `briefing --json` exposes open governed cases in a `caseQueue`.
2. `next --json` can return case-preparation work instead of forcing shell
   archaeology.
3. `context case:* --json` returns the full case packet:
   - decision question
   - subject refs
   - impact / risk / authority
   - linked evidence or provenance refs
   - linked suggestion or observation sources
   - existing briefs
   - recommended lawful actions
4. `act brief case:* --dry-run --json` validates and normalizes recommendation
   brief preparation through the action kernel.

### Checkpoint 2: Human judgment

5. A human-facing page can inspect a prepared case, its briefs, and the
   explicit decision question without leaving the governed context.
6. A human decision becomes a durable artifact linked to the case and does not
   collapse into the same artifact as the brief.

### Checkpoint 3: Linked follow-on work and closure

7. A decision compiles into linked follow-on work using existing primitives by
   default.
8. Verification and reconcile produce an explicit receipt or receipt-like view
   that compares expected and actual deltas.

## Implementation Notes

- Treat `case` as the smallest durable shape-governance artifact, not as a new
  bureaucracy for all work.
- Prefer one recommendation brief first; alternative or dissent briefs should
  layer in without changing the case spine.
- Start with dirty-bit invalidation for stale briefs and stale decisions before
  attempting richer observer-geometry scoring.
- Keep the first slice boring and inspectable in JSON before making it pretty
  anywhere else.
- The first slice proved the product semantics. Further generalization should
  now follow the substrate-alignment work in
  [0004: git-warp Substrate Alignment](./0004-substrate-alignment.md) instead
  of pushing more worldline/observer mechanics up into XYPH.

## Playback Questions

After the first checkpoint lands, ask:

1. Could a cold-start agent discover and understand an open case without shell
   archaeology?
2. Could it tell what question the case exists to answer?
3. Could it tell what authority boundary applied to the case?
4. Did the case feel like a governed spine, or just a renamed suggestion?

## Exit Criteria

This cycle closes when:

- the first governed case flow is graph-backed and machine-usable
- the agent CLI can discover, inspect, and prepare a case cleanly
- human judgment has a durable place to land
- linked follow-on work and receipts exist without inventing unnecessary new
  execution nouns
- the acceptance suite pins the first end-to-end case flow
