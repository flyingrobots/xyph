# XYPH Design

**Status:** Current product-design source of truth for XYPH.  
**Scope:** Human-facing XYPH surfaces, agent-native XYPH interaction modes,
attention routing, suggestion transparency, page taxonomy, and design-review
practice.

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
- [Cycles](./cycles/README.md)
  Design-first notes for the next bounded product or debt-reduction cycle.

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
- add or update a note under [Cycles](./cycles/README.md) when a new bounded
  cycle starts after backlog reconciliation

The rule is simple: if the product model changes, capture it here before the
new design drifts into implementation folklore.
