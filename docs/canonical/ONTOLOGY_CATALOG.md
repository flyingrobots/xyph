# ONTOLOGY CATALOG
**Version:** 0.1.0
**Status:** AUTHORITATIVE

## Purpose

This document defines the full intentional XYPH ontology catalog across:

- durable graph node families
- durable graph edge families
- public control-plane handles that use `prefix:value` syntax but are **not**
  graph nodes
- planned but not-yet-fully-implemented families that already matter to the
  human TUI, the agent CLI, or the sovereign control plane

This is the product-wide ontology catalog.

- [`/Users/james/git/xyph/docs/canonical/GRAPH_SCHEMA.md`](./GRAPH_SCHEMA.md)
  remains the concrete graph-contract document for current graph node/edge
  structure and property rules.
- [`/Users/james/git/xyph/docs/canonical/WIRE_PROTOCOL_V0.md`](./WIRE_PROTOCOL_V0.md)
  remains the sovereign machine-interface contract for `worldline`, `observer`,
  and other control-plane coordinates.
- [`/Users/james/git/xyph/docs/canonical/AUTHORITY_MODEL.md`](./AUTHORITY_MODEL.md)
  remains the authority/perception contract for observer profiles and
  capability resolution.
- [`/Users/james/git/xyph/design/product-model.md`](../../design/product-model.md)
  remains the product-design explanation of how humans and agents consume the
  same ontology through different lenses.

## Design Rules

1. XYPH has one ontology for humans and agents.
   Human pages, agent CLI flows, and `xyph api` may present different lenses,
   but they must not invent different underlying entity families.

2. Durable graph families exist only when the shared graph needs durable truth.
   If a concept is only a control-plane coordinate or a derived projection, it
   should not be modeled as a graph node family by default.

3. Prefix alone is not always enough.
   Some prefixes intentionally host multiple canonical subfamilies and require
   a discriminator such as `type` or `decision_scope`.

4. Control-plane handles are not graph nodes unless explicitly said so.
   `worldline:*` and `observer:*` are canonical public handles, but they are
   not currently part of the WARP graph node catalog.

5. Planned families must be named before implementation drift hardens.
   If the product model depends on a family, it belongs in this catalog even if
   the write path is still partial.

6. Legacy reserved prefixes are not automatically canonical.
   Old placeholder families stay reserved until a current XYPH human or agent
   workflow actually depends on them.

## Status Legend

- `Implemented`: durable graph family with active read/write semantics in the
  product.
- `Implemented partial`: real family used by product surfaces, but with an
  incomplete public authoring surface, incomplete doctrine, or both.
- `Legacy alias`: accepted compatibility shape whose canonical meaning is
  another family.
- `Planned`: intentional family or artifact kind that belongs in doctrine now
  even though durable graph support is incomplete or absent.
- `Reserved`: explicitly not part of the current canonical product ontology.

## Ontology Strata

| Stratum | Scope | Families |
|--------|-------|----------|
| Execution work | shared plan state | `task`, `campaign`, `milestone`, `intent` |
| Narrative and specification | durable context and discussion | `spec`, `adr`, `note`, `comment` |
| Traceability and completion | requirement/evidence truth | `story`, `req`, `criterion`, `evidence`, `policy` |
| Review and settlement | change review and governed completion | `submission`, `patchset`, `review`, `decision`, `approval`, `artifact` |
| Advisory intake | recommendations and suggestion queues | `suggestion`, `proposal`, `config` |
| Shape-governance | governed cases and briefs | `case`, `brief`, scoped `decision` |
| Sovereign governance artifacts | compare/collapse/attestation | `comparison-artifact`, `collapse-proposal`, `attestation` |
| Control-plane handles | public machine-facing coordinates, not graph nodes | `worldline`, `observer`, protocol artifact kinds |

## Graph Node Family Catalog

### Execution Work

| Family | Prefix | Discriminator | Status | Canonical role |
|--------|--------|---------------|--------|----------------|
| Quest | `task:*` | `type: 'task'` | Implemented | Executable work unit in the live plan. |
| Campaign | `campaign:*` | `type: 'campaign'` | Implemented | High-level work grouping and completion scope. |
| Milestone alias | `milestone:*` | `type: 'milestone'` | Legacy alias | Compatibility alias for campaign-scoped grouping. |
| Intent | `intent:*` | `type: 'intent'` | Implemented | Sovereign human purpose lineage for work. |

### Narrative And Specification

| Family | Prefix | Discriminator | Status | Canonical role |
|--------|--------|---------------|--------|----------------|
| Spec | `spec:*` | `type: 'spec'` | Implemented | Durable design/spec narrative attached to graph entities. |
| ADR | `adr:*` | `type: 'adr'` | Implemented | Durable architecture decision record. |
| Note | `note:*` | `type: 'note'` | Implemented | Durable working note or quest/case memo. |
| Comment | `comment:*` | `type: 'comment'` | Implemented | Append-only discussion artifact. |

### Traceability And Completion

| Family | Prefix | Discriminator | Status | Canonical role |
|--------|--------|---------------|--------|----------------|
| Story | `story:*` | `type: 'story'` | Implemented | Human-meaningful scenario between intent and requirements. |
| Requirement | `req:*` | `type: 'requirement'` | Implemented | Concrete requirement implemented by quests. |
| Criterion | `criterion:*` | `type: 'criterion'` | Implemented | Acceptance criterion attached to a requirement. |
| Evidence | `evidence:*` | `type: 'evidence'` | Implemented | Proof or linkage that bears on a criterion or requirement. |
| Policy | `policy:*` | `type: 'policy'` | Implemented | Definition-of-Done policy applied at campaign scope. |

### Review And Settlement

| Family | Prefix | Discriminator | Status | Canonical role |
|--------|--------|---------------|--------|----------------|
| Submission | `submission:*` | `type: 'submission'` | Implemented | Review lifecycle envelope for quest work. |
| Patchset | `patchset:*` | `type: 'patchset'` | Implemented | Immutable proposed change snapshot attached to a submission. |
| Review | `review:*` | `type: 'review'` | Implemented | Verdict artifact on a patchset. |
| Decision | `decision:*` | `type: 'decision'` plus optional `decision_scope` | Implemented partial | Terminal review or case judgment artifact. |
| Approval gate | `approval:*` | `type: 'approval'` | Implemented | Explicit human approval requirement. |
| Scroll | `artifact:*` | `type: 'scroll'` | Implemented | Sealed output of completed work. |

### Advisory Intake

| Family | Prefix | Discriminator | Status | Canonical role |
|--------|--------|---------------|--------|----------------|
| Trace-link suggestion | `suggestion:*` | `type: 'suggestion'` | Implemented partial | Low-confidence analyzer suggestion for `test -> criterion/requirement` linkage. |
| AI suggestion | `suggestion:*` | `type: 'ai_suggestion'` | Implemented | Advisory artifact for human/agent consumption, including explicit ask-AI jobs and spontaneous recommendations. |
| Proposal | `proposal:*` | `type: 'proposal'` | Implemented | Non-authoritative candidate transform or follow-on plan. |
| Config singleton | `config:xyph` | `type: 'config'` | Implemented partial | Graph-resident operational configuration layer. |

### Shape-Governance

| Family | Prefix | Discriminator | Status | Canonical role |
|--------|--------|---------------|--------|----------------|
| Case | `case:*` | `type: 'case'` | Implemented partial | Governed spine for shape-changing matters requiring briefing and human judgment. |
| Brief | `brief:*` | `type: 'brief'` | Implemented partial | Recommendation or alternative brief attached to a case. |

### Sovereign Governance Artifacts

| Family | Prefix | Discriminator | Status | Canonical role |
|--------|--------|---------------|--------|----------------|
| Comparison artifact | `comparison-artifact:*` | `type: 'comparison-artifact'` | Implemented | Durable compare-worldlines governance artifact. |
| Collapse proposal | `collapse-proposal:*` | `type: 'collapse-proposal'` | Implemented | Durable collapse preview or execution artifact. |
| Attestation | `attestation:*` | `type: 'attestation'` | Implemented | Durable governance approval/rejection/certification record. |

### Reserved / Non-Canonical Current Graph Families

These prefixes may still exist in runtime validators or older docs, but they
are **not** current canonical XYPH product families until reintroduced through
design doctrine:

- `roadmap`
- `feature`
- `crate`
- `issue`
- `concept`
- `person`
- `tool`
- `event`
- `metric`

## Family Contracts

### `task:*`

Canonical properties and readiness rules live in
[`/Users/james/git/xyph/docs/canonical/GRAPH_SCHEMA.md`](./GRAPH_SCHEMA.md).

Human use:

- cockpit `Now`, `Plan`, `Campaigns`, and `Graveyard` lanes
- quest pages and claim/promote/reopen flows

Agent use:

- `briefing`, `next`, `context task:*`, `act`, `handoff`

### `campaign:*` and `milestone:*`

`milestone:*` remains a compatibility alias for campaign semantics. New doctrine
should prefer `campaign:*` unless a specific compatibility surface requires the
legacy label.

### `decision:*`

`decision:*` is intentionally shared across at least two scopes:

- review settlement over `submission:*`
- shape-governance judgment over `case:*`

Canonical rule:

- `type: 'decision'` identifies the node family
- `decision_scope` disambiguates subfamily semantics when needed
- absence of `decision_scope` currently reads as legacy submission decision
  unless another explicit rule says otherwise

Submission-scoped decisions are part of the review/merge flow.

Case-scoped decisions currently add:

- `decision_scope: 'case'`
- `case_id`
- `expected_delta`
- optional `follow_on_artifact_id`
- optional `follow_on_artifact_kind`

### `suggestion:*`

`suggestion:*` is intentionally overloaded today and therefore requires
explicit type discrimination.

#### `type: 'suggestion'`

This is the analyzer/traceability suggestion family.

Canonical role:

- hold low-confidence candidate test links
- allow human review before materializing `verifies` or `implements`

Canonical fields include:

- `test_file`
- `target_id`
- `target_type`
- `confidence`
- `layers`
- `status`
- `suggested_by`
- `suggested_at`
- optional `rationale`
- optional `resolved_by`
- optional `resolved_at`

#### `type: 'ai_suggestion'`

This is the advisory suggestion family used by human and agent workflows.

Canonical role:

- explicit ask-AI jobs
- spontaneous agent recommendations
- structured advisory work about quests, dependencies, promotions, campaigns,
  intents, reopen candidates, and governance follow-up

Canonical fields include:

- `suggestion_kind`
- `title`
- `summary`
- `status`
- `audience`
- `origin`
- `suggested_by`
- `suggested_at`
- `related_ids`
- optional `target_id`
- optional `requested_by`
- optional `why`
- optional `evidence`
- optional `next_action`
- optional `resolved_by`
- optional `resolved_at`
- optional `resolution_kind`
- optional `resolution_rationale`
- optional `adopted_artifact_id`
- optional `adopted_artifact_kind`
- optional `superseded_by_id`

Canonical rule:

- there is **not** a separate `ask-ai-job:*` prefix right now
- explicit ask-AI requests are modeled as `suggestion:*` with
  `type: 'ai_suggestion'` and `suggestion_kind: 'ask-ai'`

### `case:*`

`case:*` is the governed spine for shape-changing matters.

Canonical fields currently used by human and agent surfaces:

- `title`
- `question` or `decision_question`
- `status`
- `impact`
- `risk`
- `authority`
- optional `opened_by`
- optional `opened_at`
- optional `reason`

Canonical statuses currently consumed by work semantics and pages include:

- `open`
- `gathering-briefs`
- `prepared`
- `ready-for-judgment`
- `deferred`
- `decided`
- `applied`
- `closed`
- `stale`
- `invalidated`

Canonical rule:

- `case:*` is a first-class product family even though its general public
  authoring surface is still incomplete
- the human TUI and agent CLI already rely on its semantics

### `brief:*`

`brief:*` is the durable judgment-preparation artifact for a case.

Canonical fields:

- `brief_kind`
- `title`
- `rationale`
- `authored_by`
- `authored_at`

Canonical body handling:

- long-form brief content lives in attached node content, not large scalar
  properties

### `config:xyph`

`config:*` is **not** a general workflow family.

Canonical rule:

- the only current canonical config node is `config:xyph`
- it stores operational config, not plan work

Current graph-resident keys include:

- `minAutoConfidence`
- `suggestionFloor`
- `testGlob`
- `heuristicWeights`
- `llm`

## Graph Edge Catalog

### Active Canonical Edge Families

| Edge | Status | From -> To | Canonical meaning |
|------|--------|------------|-------------------|
| `authorized-by` | Implemented | `task -> intent` | Quest traces to sovereign human purpose. |
| `belongs-to` | Implemented | `task -> campaign/milestone` | Quest is assigned to a campaign scope. |
| `depends-on` | Implemented | `task -> task` | Source quest depends on target quest completion. |
| `decomposes-to` | Implemented | `intent -> story`, `story -> req` | Traceability decomposition chain. |
| `implements` | Implemented | `task -> req`, optional `evidence -> req` | Canonical quest-to-requirement lineage, plus auxiliary analyzer evidence link. |
| `has-criterion` | Implemented | `req -> criterion` | Requirement owns criterion. |
| `verifies` | Implemented | `evidence -> criterion` | Evidence verifies criterion. |
| `governs` | Implemented | `policy -> campaign/milestone` | Definition-of-Done policy governs completion scope. |
| `documents` | Implemented | `spec/adr/note/brief -> any node` | Durable context or related material attachment. |
| `comments-on` | Implemented | `comment -> any node` | Discussion attachment. |
| `replies-to` | Implemented | `comment -> comment` | Threading for comments. |
| `submits` | Implemented | `submission -> task` | Submission targets quest work. |
| `has-patchset` | Implemented | `patchset -> submission` | Patchset belongs to submission lineage. |
| `reviews` | Implemented | `review -> patchset` | Review evaluates patchset. |
| `decides` | Implemented | `decision -> submission`, `decision -> case` | Terminal review or case judgment. |
| `supersedes` | Implemented | `patchset/spec/adr/note/comparison-artifact/collapse-proposal/suggestion -> prior peer` | Revision or replacement lineage. |
| `fulfills` | Implemented | `artifact -> task` | Scroll seals quest output. |
| `approves` | Implemented | `approval -> target` | Approval gate grants permission. |
| `proposes` | Implemented | `proposal -> subject` | Proposal is about subject node. |
| `targets` | Implemented | `proposal -> target` | Proposal secondary target. |
| `attests` | Implemented | `attestation -> target` | Attestation records judgment over target. |
| `suggests` | Implemented partial | `suggestion -> target` | Suggestion points at a candidate target or adopted follow-on artifact. |
| `relates-to` | Implemented partial | `suggestion -> related node` | Loose advisory cross-reference when no more specific edge exists. |
| `opened-from` | Implemented partial | `case -> suggestion or ingress artifact` | Case was elevated from one or more prior advisory artifacts. |
| `concerns` | Implemented partial | `case -> subject node` | Case is about the linked subject set. |
| `briefs` | Implemented partial | `brief -> case` | Brief is attached to a case. |
| `causes` | Implemented partial | `decision -> follow-on artifact` | Decision explicitly caused linked follow-on work. |

### Reserved / Non-Canonical Current Edge Families

These labels may remain in validators or old docs, but they are not current
first-class ontology commitments unless reintroduced deliberately:

- `augments`
- `blocks`
- `consumed-by`

## Non-Graph Public Handles

These are canonical public identifiers in XYPH, but they are **not** currently
graph node families.

| Handle family | Example | Status | Source of truth |
|---------------|---------|--------|-----------------|
| Worldline ID | `worldline:live` | Implemented | [`/Users/james/git/xyph/docs/canonical/WIRE_PROTOCOL_V0.md`](./WIRE_PROTOCOL_V0.md) |
| Derived worldline ID | `worldline:plan-rewrite` | Implemented | [`/Users/james/git/xyph/docs/WORLDLINES.md`](../WORLDLINES.md) |
| Observer profile ID | `observer:default` | Implemented | [`/Users/james/git/xyph/docs/canonical/AUTHORITY_MODEL.md`](./AUTHORITY_MODEL.md) |
| Working-set ID | substrate-specific | Implemented, non-public | git-warp substrate, not XYPH graph doctrine |

Canonical rule:

- public `worldline:*` and `observer:*` values belong to the control plane
- they should not be silently added to graph node taxonomies unless XYPH
  explicitly introduces durable node families for them

## Protocol Artifact Kinds That Are Not Yet Graph Families

The sovereign control plane already names artifact kinds beyond the current
durable graph node catalog.

Current canonical artifact kinds include:

- `observation-record`
- `comparison-artifact`
- `collapse-proposal`
- `conflict-artifact`
- `attestation-record`
- `audit-record`

Canonical rule:

- artifact kind in protocol space does **not** automatically imply a graph node
  prefix
- today, durable graph families exist for:
  - `comparison-artifact:*`
  - `collapse-proposal:*`
  - `attestation:*`
- `observation-record`, `conflict-artifact`, and `audit-record` remain planned
  protocol artifact kinds rather than graph node families

## Intentional Exclusions

These concepts matter in product semantics but are **not** separate node
families today:

- `ask-ai job`
  modeled as `suggestion:*` with `type: 'ai_suggestion'`
- `review item`
  modeled through `submission`, `patchset`, `review`, and `decision`
- `decision receipt`
  currently a derived or returned view, not a durable node family
- `observer`
  control-plane perception handle, not graph node family
- `worldline`
  control-plane coordinate, not graph node family

## Immediate Reconciliation Implications

This catalog implies the following follow-on alignments:

1. `GRAPH_SCHEMA.md` should document the active families and edges listed here
   instead of pretending `suggestion`, `case`, `brief`, or case-governance
   edges are outside canon.
2. `src/schema.ts` should accept the active graph families and edges that the
   product already uses.
3. `decision:*` doctrine should remain scope-aware rather than splitting into
   multiple prefixes prematurely.
4. `suggestion:*` doctrine should remain subtype-aware rather than pretending
   one prefix means one lifecycle.
5. `worldline:*` and `observer:*` should stay anchored in control-plane docs
   unless and until XYPH intentionally introduces durable graph families for
   them.
