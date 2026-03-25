# XYPH Design

**Status:** Current product-design source of truth for XYPH.  
**Scope:** One unified design corpus for human-facing XYPH surfaces,
agent-native XYPH interaction modes, shared semantic primitives, attention
routing, suggestion transparency, page taxonomy, and design-review practice.

## Why This Directory Exists

XYPH now has enough truthful substrate behavior and enough surface area that its
design needs to be treated as a first-class artifact, not inferred from
implementation drift.

This directory adapts **IBM Design Thinking** to XYPH by using the parts that
fit this product best:

- sponsor actors
- hills
- playbacks
- the observe / reflect / make loop

Reference material:

- [IBM Design Thinking](https://www.ibm.com/design/approach/design-thinking/)
- [IBM Enterprise Design Thinking Framework](https://www.ibm.com/training/enterprise-design-thinking/framework)

This is an adaptation, not cargo cult. XYPH should use IBM's discipline around
outcomes, review loops, and representative actors without pretending it is a
generic enterprise workflow console.

## One Corpus, Two Lenses

XYPH should not maintain one design system for humans and a separate one for
agents. It has one product, one graph, one governance model, and one set of
shared semantics.

That means this corpus should:

- define the shared primitives once
- describe the human and agent lenses side by side
- say explicitly where those lenses align
- say explicitly where they intentionally diverge

The TUI and the CLI are not separate products. They are different operating
surfaces over the same graph truth.

## Non-Negotiable Invariants

IBM Design Thinking is being applied inside XYPH's architectural and product
constraints. The design process does **not** get to override these invariants:

- **Hexagonal architecture stays pure**: human pages, agent-native CLI flows,
  and suggestion surfaces must lower through ports and domain services rather
  than inventing shadow truth in UI code.
- **The graph is the plan**: XYPH surfaces may derive, summarize, and route
  attention, but they must not replace the graph with a second hidden workflow
  system.
- **Governance is first-class**: review, attestation, comparison, collapse,
  and suggestion handling are product surfaces, not buried implementation
  details.
- **Provenance must stay inspectable**: who changed what, when, why, and by
  what mechanism must remain visible and auditable.
- **git-warp owns substrate facts; XYPH owns meaning**: deterministic graph
  history, coordinates, receipts, provenance, working sets, and braids belong
  to git-warp; ontology, governance, human surfaces, and the canonical machine
  control plane belong to XYPH.
- **Humans and agents share one reality**: different surfaces may present
  different lenses, but they should not disagree about underlying graph truth.
- **Suggestions do not bypass process**: whether sourced by a human, an
  explicit ask-AI job, or a spontaneous agent observation, ideas still enter
  the same lawful lifecycle.
- **Human judgment governs; agent surfaces force clarity**: XYPH should be
  designed equally from both perspectives, but the default technical pressure
  should come from agent-native surfaces because they expose missing building
  blocks quickly. That pressure does not override human explainability,
  legibility, or governance boundaries.

## Product Intent

XYPH is the app.

`AION` is the underlying computational / time-travel model that git-warp
implements. It can inform future XYPH surfaces, but it is not the product name
of this application.

XYPH exists so a human or agent can:

- understand what changed, who did it, and why it matters
- see the live plan and its speculative alternatives honestly
- inspect and govern review / attestation / settlement state
- inspect AI-driven suggestions without confusing them for human or settled truth
- take lawful action with full context
- recover dead or rejected work without losing causal history
- leave durable graph-native state behind for the next collaborator, whether
  that collaborator is human or agent

## Design And Build Order

XYPH should be designed from both the human and agent perspectives on purpose.
Neither surface is a compatibility appendix.

By default, implementation should proceed in this order:

1. define the shared semantic packet and lawful action model
2. make the agent-native CLI/protocol express those semantics cleanly
3. build the human-facing page or TUI flow on top of the same semantics

This is the default because agent-native interfaces expose missing building
blocks, hidden ambiguity, and soft semantics faster than UI polish does.

The constraint on that default is equally important:

- human judgment still defines what must be understandable
- human explainability still defines what must be legible
- if the agent surface and human surface diverge semantically, the product is
  drifting

Cycles usually move through doctrine, spec, semantic, and surface checkpoints.
Those checkpoints are useful internally, but the slice is judged through formal
playbacks tied to sponsor actors and hills, not just by whether a checkpoint
exists.

## Design Corpus

Start here, then use the focused design documents below:

- [Sponsor Actors](./sponsor-actors.md)
  Human sponsor users and agent sponsor actors with concrete success
  conditions.
- [Hills](./hills.md)
  Outcome-oriented hills and the currently selected vertical program.
- [Playbacks](./playbacks.md)
  Design review cadence, playback questions, and the observe / reflect / make
  loop.
- [Invariants](./invariants.md)
  The architectural and product constraints that IBM-style design work must not
  violate.
- [Product Model](./product-model.md)
  Product principles, shared primitives, attention model, page model, and
  immediate design program.
- [Product Loop](./product-loop.md)
  The larger governed project-shaping loop XYPH is meant to embody, including
  how humans and agents participate differently in the same evolving process.
- [Cycles](./cycles/README.md)
  Design-first notes for the next bounded product or debt-reduction cycle.
- [Alignment Sweep — 2026-03](./alignment-sweep-2026-03.md)
  Short philosophical alignment review of docs, backlog, and graveyard against
  the current product doctrine.

## Relationship To Other Docs

- [`/Users/james/git/xyph/docs/canonical/ARCHITECTURE.md`](../docs/canonical/ARCHITECTURE.md)
  remains the technical architecture source of truth.
- [`/Users/james/git/xyph/docs/canonical/AGENT_PROTOCOL.md`](../docs/canonical/AGENT_PROTOCOL.md)
  remains the protocol and command-contract source of truth.
- [`/Users/james/git/xyph/CONTRIBUTING.md`](../CONTRIBUTING.md)
  codifies the milestone development loop, acceptance-test-as-spec rule, and
  milestone closeout/backlog-reconciliation workflow.
- [`docs/XYPH_PRODUCT_DESIGN.md`](../docs/XYPH_PRODUCT_DESIGN.md)
  is now a compatibility pointer to this directory so older references do not
  silently break.

## How To Use This Directory

- update [Sponsor Actors](./sponsor-actors.md) when the product starts serving
  a materially different human or agent job
- update [Hills](./hills.md) when the next outcome targets change
- update [Playbacks](./playbacks.md) when the review practice changes
- update [Invariants](./invariants.md) if XYPH's architectural or product
  boundaries materially change
- update [Product Model](./product-model.md) whenever page structure,
  attention semantics, AI suggestion rules, or human/agent interaction models
  materially change
- update alignment language whenever the human and agent lenses start drifting,
  or whenever a new cycle intentionally privileges one surface first
- add or update a note under [Cycles](./cycles/README.md) when a new bounded
  cycle starts after backlog reconciliation

The rule is simple: if the product model changes, capture it here before the
new design drifts into implementation folklore.
