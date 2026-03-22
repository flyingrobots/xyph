# Invariants

These invariants constrain every XYPH design decision. They are not optional
preferences, and IBM-style design work should be applied inside them rather
than against them.

## 1. Hexagonal Architecture Stays Pure

Human pages, agent-native CLI flows, suggestions, and dashboards must lower
through ports and domain services. XYPH should not move business truth into
surface code just because the UI would be easier to prototype that way.

Design implication:

- pages and commands may frame or derive
- domain services and ports still own lawful behavior

## 2. The Graph Is The Plan

XYPH must not create a second hidden workflow system that competes with the
graph. The UI can summarize and route attention, but it cannot quietly become a
different source of truth.

Design implication:

- landing lanes, pages, queues, and badges are projections over graph-backed
  state
- hidden shadow state is not allowed to redefine what work exists

## 3. Governance Is First-Class

Review, attestation, comparison, collapse, and suggestion handling are not
side quests. They are central product surfaces.

Design implication:

- governance needs real pages, explicit states, and clear next lawful actions
- suggestions remain advisory until governed through the normal path

## 4. Provenance Must Stay Inspectable

Users and agents must be able to answer:

- who changed this?
- when?
- why?
- through what artifact or mechanism?

Design implication:

- explainability is not decoration
- `[AI]` labeling and explainability flows are required where AI is involved
- silent automation that erases provenance is not acceptable

## 5. git-warp Owns Substrate Facts; XYPH Owns Meaning

git-warp owns deterministic graph history, observation coordinates, provenance,
receipts, working sets, braids, and other substrate facts. XYPH owns ontology,
governance, human-facing surfaces, and the canonical machine control plane.

Design implication:

- do not leak XYPH governance or business semantics into git-warp
- do not invent substrate truth in XYPH where git-warp should own it

## 6. One Lawful Mutation Path

Suggestions, quests, governance actions, and agent work should all lower
through the same lawful mutation and audit model rather than a collection of
special-case shortcuts.

Design implication:

- "Ask the AI" jobs do not bypass intake
- agent-originated ideas do not bypass governance
- human-facing convenience cannot skip the same lifecycle everyone else uses

## 7. Humans And Agents Share One Reality

Human cockpit pages and agent-native CLI packets may differ in format, but they
must not disagree about graph truth, governance state, or lawful next actions.

Design implication:

- shared semantic packets matter
- derived judgments should be named consistently across surfaces

## 8. Design Must Preserve Auditability

If a design change makes the system feel smoother by hiding provenance,
governance, or the real graph state, it is the wrong design.

Design implication:

- prefer legible truth over frictionless illusion
- "easy" is only good when it remains honest
