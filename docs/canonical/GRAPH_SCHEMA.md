# GRAPH SCHEMA
**Version:** 2.5.0
**Status:** AUTHORITATIVE

**Scope note:** This document defines the concrete graph-node and graph-edge
contract for the current WARP graph. For the full product-wide ontology
catalog, including partially implemented families and non-graph public handles
such as `worldline:*` and `observer:*`, see
[`/Users/james/git/xyph/docs/canonical/ONTOLOGY_CATALOG.md`](./ONTOLOGY_CATALOG.md).

## 1. Node ID Grammar

Every node ID MUST follow the `prefix:identifier` format.
- **Prefix:** Lowercase string from the allowed taxonomy (Section 2).
- **Identifier:** Case-preserving alphanumeric string (dashes and underscores allowed).

Example: `task:BDK-001`, `campaign:BEDROCK`, `submission:abc123`

## 2. Prefix Taxonomy

### Active Prefixes (canonical graph families used by the product)

| Prefix | Node Type | Purpose | Example |
|--------|-----------|---------|---------|
| `task` | Quest | Granular unit of work. | `task:BDK-001` |
| `campaign` | Campaign | High-level milestone or epoch. | `campaign:BEDROCK` |
| `milestone` | Campaign | Alias for campaign (legacy). | `milestone:M1` |
| `intent` | Intent | Sovereign human declaration of purpose. | `intent:SOVEREIGNTY` |
| `story` | Story | User-story layer between intent and requirements. | `story:TRC-001` |
| `req` | Requirement | Concrete requirement implemented by work. | `req:TRC-001` |
| `criterion` | Criterion | Verifiable acceptance criterion for a requirement. | `criterion:TRC-001` |
| `evidence` | Evidence | Evidence that verifies a criterion or links to a requirement. | `evidence:scan-TRC-001` |
| `policy` | Policy | Campaign-scoped Definition of Done policy. | `policy:done-default` |
| `config` | Config | Graph-resident operational configuration singleton. | `config:xyph` |
| `suggestion` | Suggestion | Advisory intake family; `type` distinguishes trace-link vs AI suggestion semantics. | `suggestion:019xyz` |
| `case` | Case | Governed shape-change matter requiring preparation and judgment. | `case:TRACE-1` |
| `brief` | Brief | Durable recommendation brief attached to a case. | `brief:TRACE-REC` |
| `spec` | Spec | Graph-native design/spec document. | `spec:ready-gate` |
| `adr` | ADR | Graph-native architecture decision record. | `adr:0007` |
| `note` | Note | Graph-native working note or quest memo. | `note:quest-brief` |
| `comment` | Comment | Append-only discussion event. | `comment:019xyz` |
| `proposal` | Proposal | Non-authoritative candidate transform or plan. | `proposal:019xyz` |
| `collapse-proposal` | Collapse Proposal | Durable settlement preview or execution artifact. | `collapse-proposal:abc123` |
| `comparison-artifact` | Comparison Artifact | Durable governance comparison artifact. | `comparison-artifact:def456` |
| `attestation` | Attestation | Append-only approval/rejection/certification record. | `attestation:019xyz` |
| `artifact` | Scroll | Sealed output of completed quest. | `artifact:task:BDK-001` |
| `approval` | ApprovalGate | Formal human approval requirement. | `approval:cp-001` |
| `submission` | Submission | Review lifecycle envelope. | `submission:abc123` |
| `patchset` | Patchset | Immutable proposed change snapshot. | `patchset:def456` |
| `review` | Review | Per-reviewer verdict on a patchset. | `review:ghi789` |
| `decision` | Decision | Shared review-settlement or case-judgment artifact. | `decision:jkl012` |

### Reserved / Non-Canonical Current Prefixes

| Prefix | Purpose |
|--------|---------|
| `roadmap` | Root container. |
| `feature` | Groups of related tasks. |
| `crate` | Reusable module. |
| `issue` | Bug or defect. |
| `concept` | Abstract idea. |
| `person` | Human participant. |
| `tool` | External tool reference. |
| `event` | Calendar or milestone event. |
| `metric` | Measured value. |

## 3. Edge Types

### Active Edge Types

| Edge Label | From → To | Meaning |
|------------|-----------|---------|
| `belongs-to` | task → campaign/milestone | Quest is part of a campaign. |
| `authorized-by` | task → intent | Quest traces to human intent (sovereignty). |
| `depends-on` | task → task | Source cannot start until target is DONE. |
| `decomposes-to` | intent/story → story/req | Traceability decomposition: intent into story, story into requirement. |
| `implements` | task/evidence → req | Quest-to-requirement lineage is canonical; analyzer-generated evidence may also attach directly to a requirement. |
| `has-criterion` | req → criterion | Requirement owns one or more acceptance criteria. |
| `verifies` | evidence → criterion | Evidence verifies a criterion. |
| `governs` | policy → campaign/milestone | Definition of Done policy governs a campaign or milestone. |
| `documents` | spec/adr/note/brief → target | Durable narrative or brief context records linked material for a node. |
| `comments-on` | comment → target | Append-only discussion attached to a node. |
| `replies-to` | comment → comment | Comment-thread reply chain. |
| `proposes` | proposal → subject | Proposal is about the subject node. |
| `targets` | proposal → target | Optional secondary target of a proposal. |
| `attests` | attestation → target | Attestation records a decision over a target artifact. |
| `fulfills` | artifact → task | Scroll is the sealed output of a quest. |
| `submits` | submission → task | Submission proposes work for a quest. |
| `has-patchset` | patchset → submission | Patchset belongs to a submission. |
| `supersedes` | patchset/spec/adr/note/comparison-artifact/collapse-proposal/suggestion → prior peer | Append-only revision, advisory replacement, or governance-lane replacement. |
| `reviews` | review → patchset | Review evaluates a patchset. |
| `decides` | decision → submission/case | Terminal review settlement or case judgment. |
| `approves` | approval → (target) | Approval gate grants permission. |
| `suggests` | suggestion → target | Suggestion points at a candidate target or adopted follow-on artifact. |
| `relates-to` | suggestion → related node | Loose advisory cross-reference when no more specific edge exists. |
| `opened-from` | case → suggestion/ingress artifact | Case was elevated from prior advisory or provenance artifacts. |
| `concerns` | case → subject node | Case is about the linked subject set. |
| `briefs` | brief → case | Brief is attached to a case. |
| `causes` | decision → follow-on artifact | Decision explicitly caused linked follow-on work. |

### Reserved / Non-Canonical Current Edge Types

| Edge Label | Meaning |
|------------|---------|
| `augments` | Extends or enhances another node. |
| `blocks` | Forward dependency (inverse of depends-on). |
| `consumed-by` | Resource consumption. |

## 4. Node Property Contracts

All properties use **snake_case** in the WARP graph. Timestamps are Unix epoch numbers.

**Design rule:** queryable metadata belongs in node/edge properties. Substantial bodies belong in graph-native content blobs attached with `attachContent()` / `attachEdgeContent()`.

**Subtype-aware families:** `suggestion:*` uses `type` to distinguish
trace-link suggestions from AI suggestions. `decision:*` uses `type: 'decision'`
for the shared family and `decision_scope` when the concrete decision semantics
need further disambiguation.

### Quest (`task:*`)

| Property | Type | Set By | Notes |
|----------|------|--------|-------|
| `type` | `'task'` | quest command | Required. |
| `title` | string | quest command | ≥5 chars. |
| `status` | QuestStatus | lifecycle | See valid values below. |
| `hours` | number | quest command | ≥0, default 0. |
| `priority` | string | intake/shape/ingest | `P0` through `P5`. Defaults to `P3`. |
| `description` | string | intake/quest command | Optional durable summary/body preview. |
| `task_kind` | string | intake/quest command | `delivery`, `spike`, `maintenance`, or `ops`. Defaults to `delivery`. |
| `assigned_to` | string | claim command | Principal ID (e.g., `agent.hal`). |
| `claimed_at` | number | claim command | Timestamp. |
| `ready_by` | string | ready command | Principal who moved the quest into READY. |
| `ready_at` | number | ready command | Timestamp. |
| `completed_at` | number | seal/merge | Timestamp. |
| `origin_context` | string | ingest | Optional provenance. |
| `suggested_by` | string | inbox command | Who suggested it. |
| `suggested_at` | number | inbox command | Timestamp. |
| `rejected_by` | string | reject command | Who rejected it. |
| `rejected_at` | number | reject command | Timestamp. |
| `rejection_rationale` | string | reject command | Non-empty rationale. |
| `reopened_by` | string | reopen command | Who reopened it. |
| `reopened_at` | number | reopen command | Timestamp. |

**Valid QuestStatus values:** `BACKLOG`, `PLANNED`, `READY`, `IN_PROGRESS`, `BLOCKED`, `DONE`, `GRAVEYARD`

Legacy: Pre-VOC-001 `INBOX` values are normalized to `BACKLOG` at read time.

**Edges:**
- `belongs-to` → campaign:/milestone: (required before `READY`)
- `authorized-by` → intent: (required for `PLANNED`+)
- `depends-on` → task: (optional, Weaver)
- `implements` → req: (required by readiness for `delivery`, `maintenance`, and `ops`)

**Execution semantics:**
- `PLANNED` quests are draft-shaped work and are excluded from executable DAG analysis.
- `READY`, `IN_PROGRESS`, `BLOCKED`, and `DONE` participate in executable frontier / critical-path computations.

**Readiness by `task_kind`:**
- `delivery`: requires `task → implements → req`, `story → decomposes-to → req`, and `req → has-criterion → criterion`
- `maintenance`: requires `task → implements → req` and `req → has-criterion → criterion`
- `ops`: requires `task → implements → req` and `req → has-criterion → criterion` (manual evidence may satisfy later settlement)
- `spike`: requires at least one incoming `documents` edge from `note:*`, `spec:*`, or `adr:*`

---

### Intent (`intent:*`)

| Property | Type | Set By | Notes |
|----------|------|--------|-------|
| `type` | `'intent'` | intent command | Required. |
| `title` | string | intent command | ≥5 chars. |
| `requested_by` | string | intent command | Must start with `human.`. |
| `created_at` | number | intent command | Required. |
| `description` | string | intent command | Optional. |

**Edges:** Incoming `authorized-by` from task: nodes.

---

### Story (`story:*`)

| Property | Type | Set By | Notes |
|----------|------|--------|-------|
| `type` | `'story'` | story/packet command | Required. |
| `title` | string | story/packet command | ≥5 chars. |
| `persona` | string | story/packet command | Required. |
| `goal` | string | story/packet command | Required. |
| `benefit` | string | story/packet command | Required. |
| `created_by` | string | story/packet command | Principal ID. |
| `created_at` | number | story/packet command | Timestamp. |

**Edges:**
- Incoming `decomposes-to` from `intent:` (optional but canonical for traced delivery work)
- `decomposes-to` → `req:` (canonical story-to-requirement link)

---

### Requirement (`req:*`)

| Property | Type | Set By | Notes |
|----------|------|--------|-------|
| `type` | `'requirement'` | requirement/packet command | Required. |
| `description` | string | requirement/packet command | ≥5 chars. |
| `kind` | RequirementKind | requirement/packet command | `functional` or `non-functional`. |
| `priority` | RequirementPriority | requirement/packet command | `must`, `should`, `could`, or `wont`. |

**Edges:**
- Incoming `decomposes-to` from `story:` (required for `delivery` readiness)
- Incoming `implements` from `task:` (required for requirement-backed quest readiness)
- Incoming `implements` from `evidence:` (optional auxiliary auto-link used by analysis/suggestions flows)
- `has-criterion` → `criterion:` (required before a requirement-backed quest becomes `READY`)

---

### Criterion (`criterion:*`)

| Property | Type | Set By | Notes |
|----------|------|--------|-------|
| `type` | `'criterion'` | criterion/packet command | Required. |
| `description` | string | criterion/packet command | ≥5 chars. |
| `verifiable` | boolean | criterion/packet command | Required on write; defaults to `true` in the standard CLI flow. |

**Edges:**
- Incoming `has-criterion` from `req:` (canonical requirement-to-criterion link)
- Incoming `verifies` from `evidence:` (evidence attached to this criterion)

---

### Evidence (`evidence:*`)

| Property | Type | Set By | Notes |
|----------|------|--------|-------|
| `type` | `'evidence'` | evidence/scan/analyze/suggestions | Required. |
| `kind` | EvidenceKind | evidence/scan/analyze/suggestions | `test`, `benchmark`, `manual`, or `screenshot`. |
| `result` | EvidenceResult | evidence/scan/analyze/suggestions | `pass`, `fail`, or `linked`. |
| `produced_at` | number | evidence/scan/analyze/suggestions | Timestamp. |
| `produced_by` | string | evidence/scan/analyze/suggestions | Principal or producing subsystem. |
| `artifact_hash` | string | evidence command | Optional content hash. |
| `scan_locations` | string | scan command | Optional JSON-encoded file/line list for annotation-discovered evidence. |
| `source_file` | string | analyze/suggestions | Optional source test file for auto-linked evidence. |
| `auto_confidence` | number | analyze/suggestions | Optional heuristic confidence in the auto-link. |

**Edges:**
- `verifies` → `criterion:` (canonical evidence-to-criterion link)
- optional `implements` → `req:` (auxiliary requirement-level auto-link produced by analysis/suggestions)

---

### Policy (`policy:*`)

| Property | Type | Set By | Notes |
|----------|------|--------|-------|
| `type` | `'policy'` | policy command | Required. |
| `coverage_threshold` | number | policy command | Between `0` and `1`; defaults to `1.0`. |
| `require_all_criteria` | boolean | policy command | Defaults to `true`. |
| `require_evidence` | boolean | policy command | Defaults to `true`. |
| `allow_manual_seal` | boolean | policy command | Defaults to `false`. |

**Edges:**
- `governs` → `campaign:`/`milestone:` (required when attaching policy scope)

---

### Config (`config:xyph`)

`config:*` is not a general workflow family. The only current canonical graph
config node is `config:xyph`.

| Property | Type | Set By | Notes |
|----------|------|--------|-------|
| `type` | `'config'` | config command | Required. |
| `minAutoConfidence` | number | config command | Optional analyzer auto-link threshold. |
| `suggestionFloor` | number | config command | Optional minimum confidence for creating `suggestion:*` nodes. |
| `testGlob` | string | config command | Optional glob for analyzer test discovery. |
| `heuristicWeights` | string | config command | Optional JSON-encoded heuristic-layer weights. |
| `llm` | string | config command | Optional JSON-encoded LLM provider/model config. |

**Edges:** none canonical.

---

### Suggestion (`suggestion:*`)

`suggestion:*` is intentionally subtype-aware. The `type` property is required
to disambiguate between trace-link suggestions and AI suggestions.

#### Trace-Link Suggestion (`type: 'suggestion'`)

These nodes hold low-confidence analyzer candidates for
`test -> criterion/requirement` linkage pending human review.

| Property | Type | Set By | Notes |
|----------|------|--------|-------|
| `type` | `'suggestion'` | analyze command | Required. |
| `test_file` | string | analyze command | Source test file. |
| `target_id` | string | analyze command | Suggested `criterion:*` or `req:*` target. |
| `target_type` | string | analyze command | `'criterion'` or `'requirement'`. |
| `confidence` | number | analyze command | Between `0` and `1`. |
| `layers` | string | analyze command | JSON-encoded heuristic layer breakdown. |
| `status` | SuggestionStatus | analyze/suggestions | `PENDING`, `ACCEPTED`, or `REJECTED`. |
| `suggested_by` | string | analyze command | Principal ID. |
| `suggested_at` | number | analyze command | Timestamp. |
| `rationale` | string | suggestions command | Optional human rationale on accept/reject. |
| `resolved_by` | string | suggestions command | Optional principal who resolved the suggestion. |
| `resolved_at` | number | suggestions command | Optional resolution timestamp. |

**Edges:**
- `suggests` → `criterion:`/`req:` (required candidate linkage)

#### AI Suggestion (`type: 'ai_suggestion'`)

These nodes are advisory artifacts used by the human TUI and the agent CLI for
explicit ask-AI jobs and spontaneous recommendations.

| Property | Type | Set By | Notes |
|----------|------|--------|-------|
| `type` | `'ai_suggestion'` | suggestions/record services | Required. |
| `suggestion_kind` | string | suggestions/record services | `ask-ai`, `quest`, `dependency`, `promotion`, `campaign`, `intent`, `governance`, `reopen`, or `general`. |
| `title` | string | suggestions/record services | Required short label. |
| `summary` | string | suggestions/record services | Required durable summary. |
| `status` | AiSuggestionStatus | suggestions/record services | `suggested`, `queued`, `accepted`, `rejected`, or `implemented`. |
| `audience` | AiSuggestionAudience | suggestions/record services | `human`, `agent`, or `either`. |
| `origin` | AiSuggestionOrigin | suggestions/record services | `spontaneous` or `request`. |
| `suggested_by` | string | suggestions/record services | Principal or subsystem. |
| `suggested_at` | number | suggestions/record services | Timestamp. |
| `related_ids` | string | suggestions/record services | JSON-encoded related node ID list. |
| `target_id` | string | suggestions/record services | Optional primary target. |
| `requested_by` | string | suggestions/record services | Optional requester for ask-AI style flows. |
| `why` | string | suggestions/record services | Optional rationale/context. |
| `evidence` | string | suggestions/record services | Optional supporting evidence summary. |
| `next_action` | string | suggestions/record services | Optional recommended next step. |
| `resolved_by` | string | suggestions/record services | Optional resolver principal. |
| `resolved_at` | number | suggestions/record services | Optional resolution timestamp. |
| `resolution_kind` | string | suggestions/record services | Optional `adopted`, `dismissed`, or `superseded`. |
| `resolution_rationale` | string | suggestions/record services | Optional durable rationale for resolution. |
| `adopted_artifact_id` | string | suggestions/record services | Optional quest/proposal created during adoption. |
| `adopted_artifact_kind` | string | suggestions/record services | Optional `quest` or `proposal`. |
| `superseded_by_id` | string | suggestions/record services | Optional replacement artifact. |

**Bodies:** stored via `attachContent()` as structured advisory content or
ask-AI output. Long-form reasoning should live in the content blob, not in
large scalar properties.

**Edges:**
- optional `suggests` → primary target or adopted follow-on artifact
- optional `relates-to` → additional related nodes
- optional incoming `opened-from` from `case:` nodes when a suggestion is elevated into governed casework
- optional incoming `supersedes` from the replacing artifact when explicitly superseded

---

### Case (`case:*`)

`case:*` is the durable shape-governance spine for matters that materially
alter frontier, sequencing, policy, or doctrine.

| Property | Type | Set By | Notes |
|----------|------|--------|-------|
| `type` | `'case'` | case/governance flows | Required. |
| `title` | string | case/governance flows | Durable short label. |
| `question` | string | case/governance flows | Preferred explicit decision question. |
| `decision_question` | string | legacy/case flows | Legacy compatibility alias for `question`. |
| `status` | CaseStatus | case/governance flows | See current values below. Defaults to `open` at read time. |
| `impact` | string | case/governance flows | Design-intent axis. Current values are `local`, `frontier`, `policy`, or `doctrine`. |
| `risk` | string | case/governance flows | Design-intent axis. Current values are `reversible-low`, `reversible-high`, or `hard-to-reverse`. |
| `authority` | string | case/governance flows | Design-intent axis. Current values are `human-only`, `human-decide-agent-apply`, or `policy-delegated`. |
| `opened_by` | string | case/governance flows | Optional principal who opened the case. |
| `opened_at` | number | case/governance flows | Optional opening timestamp. |
| `reason` | string | case/governance flows | Optional explanation of why governed handling was required. |

**Current CaseStatus values:** `open`, `gathering-briefs`, `prepared`,
`ready-for-judgment`, `deferred`, `decided`, `applied`, `closed`, `stale`,
`invalidated`

**Edges:**
- `concerns` → one or more subject nodes the case is about
- optional `opened-from` → prior advisory or provenance artifacts such as `suggestion:*`
- incoming `briefs` from `brief:` nodes
- incoming `decides` from case-scoped `decision:` nodes

---

### Brief (`brief:*`)

`brief:*` is the durable judgment-preparation artifact attached to a case.

| Property | Type | Set By | Notes |
|----------|------|--------|-------|
| `type` | `'brief'` | agent/human case-prep flows | Required. |
| `brief_kind` | string | agent/human case-prep flows | Current public flow uses `recommendation`. |
| `title` | string | agent/human case-prep flows | Required short label. |
| `rationale` | string | agent/human case-prep flows | Required summary of the recommendation. |
| `authored_by` | string | agent/human case-prep flows | Principal ID. |
| `authored_at` | number | agent/human case-prep flows | Timestamp. |

**Bodies:** stored via `attachContent()` on the node. The content blob carries
the long-form recommendation body.

**Edges:**
- `briefs` → `case:` (required)
- optional `documents` → related nodes other than the owning case

---

### Graph-native Docs / Discussion (`spec:*`, `adr:*`, `note:*`, `comment:*`)

These node families keep durable coordination narrative inside the XYPH graph.
`brief:*` is documented separately because it carries case-governance semantics
in addition to durable narrative content.

| Property | Type | Applies To | Notes |
|----------|------|------------|-------|
| `type` | string | all | `spec`, `adr`, `note`, or `comment`. |
| `title` | string | `spec`, `adr`, `note` | Short queryable label. |
| `authored_by` | string | all | Principal ID. |
| `authored_at` | number | all | Timestamp. |

**Bodies:** stored via `attachContent()` on the node. Do not store long-form markdown in scalar properties.

**Edges:**
- `documents` → any node ID (durable linked context)
- `comments-on` → any node ID (discussion attachment)
- `replies-to` → comment: (threading)
- `supersedes` → prior spec:/adr:/note: revision (append-only history)

---

### Proposal (`proposal:*`)

Proposals are non-authoritative candidate transforms. They may suggest
dependencies, packets, doctor fixes, collapse plans, or other future-safe graph
changes, but they do not become truth by existing.

| Property | Type | Set By | Notes |
|----------|------|--------|-------|
| `type` | `'proposal'` | control plane | Required. |
| `proposal_kind` | string | control plane | E.g. `dependency`, `packet`, `doctor-fix`. |
| `subject_id` | string | control plane | Primary subject of the proposal. |
| `target_id` | string | control plane | Optional secondary target. |
| `proposed_by` | string | control plane | Principal ID. |
| `proposed_at` | number | control plane | Timestamp. |
| `observer_profile_id` | string | control plane | Observer used when authoring the proposal. |
| `policy_pack_version` | string | control plane | Policy pack in force when authored. |

**Bodies:** stored via `attachContent()` on the node as structured proposal
content. The current control-plane slice stores JSON containing at least
`rationale` and `payload`.

**Edges:**
- `proposes` → subject node (required)
- `targets` → target node (optional)

---

### Collapse Proposal (`collapse-proposal:*`)

`collapse_worldline persist:true` records the current collapse artifact on
`worldline:live` even when the compared source worldline is derived. The
record may represent either a dry-run preview or an executed collapse attempt;
the `dry_run`, `executable`, and `executed` properties make that explicit.

| Property | Type | Set By | Notes |
|----------|------|--------|-------|
| `type` | `'collapse-proposal'` | control plane | Required. |
| `artifact_digest` | string | control plane | Stable XYPH artifact identity. |
| `artifact_series_key` | string | control plane | Stable governance-lane key for supersession lineage. |
| `comparison_artifact_digest` | string | control plane | Fresh compare digest used for the preview. |
| `comparison_scope_version` | string | control plane | XYPH operational scope version used for freshness. |
| `transfer_digest` | string | control plane | Published git-warp transfer-plan digest. |
| `source_worldline_id` | string | control plane | Source worldline being settled. |
| `target_worldline_id` | string | control plane | Current slice uses `worldline:live`. |
| `recorded_by` | string | control plane | Principal ID. |
| `recorded_at` | number | control plane | Timestamp. |
| `observer_profile_id` | string | control plane | Observer in force when recorded. |
| `policy_pack_version` | string | control plane | Policy pack in force when recorded. |
| `dry_run` | boolean | control plane | `true` for preview artifacts, `false` for live execution artifacts. |
| `executable` | boolean | control plane | Whether the current slice can honestly commit the planned transfer ops. |
| `executed` | boolean | control plane | Whether live mutation actually committed during this call. |
| `execution_patch` | string | control plane | Optional live patch SHA when `executed` is true. |
| `changed` | boolean | control plane | Whether the transfer plan contains substantive work. |
| `attestation_count` | number | control plane | Optional count of supplied attestation IDs. |

**Bodies:** stored via `attachContent()` on the node as a deterministic JSON
copy of the returned `collapse-proposal` payload, including the published
git-warp comparison/transfer fact exports.

**Edges:**
- optional `supersedes` → older `collapse-proposal:*` in the same governance lane
- incoming `attests` from `attestation:*` records are expected
- current live execution gates on approving attestations over the corresponding
  `comparison-artifact:*`, not on `collapse-proposal:*`

### Comparison Artifact (`comparison-artifact:*`)

`compare_worldlines persist:true` records a durable governance comparison
artifact on `worldline:live` without changing the operational freshness digest
that later compare/collapse flows use. The durable node is append-only and
carries both:

- the raw whole-graph git-warp comparison fact for audit
- the XYPH operationally scoped comparison fact used for freshness and
  settlement preview

| Property | Type | Set By | Notes |
|----------|------|--------|-------|
| `type` | `'comparison-artifact'` | control plane | Required. |
| `artifact_digest` | string | control plane | Stable XYPH artifact identity. |
| `artifact_series_key` | string | control plane | Stable governance-lane key for supersession lineage. |
| `comparison_policy_version` | string | control plane | Policy/version label in force for freshness. |
| `comparison_scope_version` | string | control plane | Current XYPH operational scope version. |
| `left_worldline_id` | string | control plane | Left-hand worldline under comparison. |
| `right_worldline_id` | string | control plane | Right-hand worldline under comparison. |
| `operational_comparison_digest` | string | control plane | Published git-warp scoped comparison digest. |
| `raw_comparison_digest` | string | control plane | Published git-warp whole-graph comparison digest. |
| `target_id` | string | control plane | Optional entity-local comparison focus. |
| `recorded_by` | string | control plane | Principal ID. |
| `recorded_at` | number | control plane | Timestamp. |
| `observer_profile_id` | string | control plane | Observer in force when recorded. |
| `policy_pack_version` | string | control plane | Policy pack in force when recorded. |

**Bodies:** stored via `attachContent()` on the node as a deterministic JSON
copy of the returned `comparison-artifact` payload, including both the raw
whole-graph substrate fact and the XYPH-scoped operational substrate fact.

**Edges:**
- optional `supersedes` → older `comparison-artifact:*` in the same governance lane
- incoming `attests` from `attestation:*` records are expected
- current `collapse_worldline dryRun:false` uses approving attestations over
  this durable comparison artifact as the execution gate

---

### Attestation (`attestation:*`)

Attestations are append-only decision records. They record approval, rejection,
certification, waiver, endorsement, or escalation with explicit provenance.

| Property | Type | Set By | Notes |
|----------|------|--------|-------|
| `type` | `'attestation'` | control plane | Required. |
| `decision` | string | control plane | Approval/rejection/certification style decision. |
| `target_id` | string | control plane | Artifact or entity being attested. |
| `attested_by` | string | control plane | Principal ID. |
| `attested_at` | number | control plane | Timestamp. |
| `observer_profile_id` | string | control plane | Observer used for the decision context. |
| `policy_pack_version` | string | control plane | Policy pack in force when attested. |

**Bodies:** stored via `attachContent()` on the node as structured decision
content. The current control-plane slice stores JSON containing at least
`rationale` and `scope`.

**Edges:**
- `attests` → target node (required)

---

### Campaign (`campaign:*` / `milestone:*`)

| Property | Type | Set By | Notes |
|----------|------|--------|-------|
| `type` | `'campaign'` or `'milestone'` | seed/manual | Required. |
| `title` | string | seed/manual | Required. |
| `status` | CampaignStatus | manual | Optional, defaults to `UNKNOWN`. |

**Valid CampaignStatus values:** `BACKLOG`, `IN_PROGRESS`, `DONE`, `UNKNOWN`

**Edges:** Incoming `belongs-to` from task: nodes.

---

### Scroll (`artifact:*`)

| Property | Type | Set By | Notes |
|----------|------|--------|-------|
| `type` | `'scroll'` | seal/merge | Required. |
| `artifact_hash` | string | seal/merge | Content hash. |
| `rationale` | string | seal/merge | Explanation. |
| `sealed_by` | string | seal/merge | Principal ID. |
| `sealed_at` | number | seal/merge | Timestamp. |
| `payload_digest` | string | GuildSealService | Hash for signing. |
| `guild_seal_alg` | string | GuildSealService | `'ed25519'` if signed. |
| `guild_seal_key_id` | string | GuildSealService | Public key ID. |
| `guild_seal_sig` | string | GuildSealService | Signature. |

**ID convention:** `artifact:{questId}` (e.g., `artifact:task:BDK-001`)

**Edges:** `fulfills` → task: (the sealed quest).

---

### Approval Gate (`approval:*`)

| Property | Type | Set By | Notes |
|----------|------|--------|-------|
| `type` | `'approval'` | sovereignty service | Required. |
| `status` | ApprovalGateStatus | lifecycle | `PENDING`, `APPROVED`, `REJECTED`. |
| `trigger` | ApprovalGateTrigger | sovereignty service | Why approval is needed. |
| `requested_by` | string | sovereignty service | Must start with `agent.`. |
| `approver` | string | sovereignty service | Must start with `human.`. |
| `patch_ref` | string | sovereignty service | Reference to affected patch. |
| `created_at` | number | sovereignty service | Timestamp. |
| `resolved_at` | number | resolution | Timestamp. |
| `rationale` | string | resolution | Optional explanation. |

**Valid triggers:** `CRITICAL_PATH_CHANGE`, `SCOPE_INCREASE_GT_5PCT`

---

### Submission (`submission:*`)

| Property | Type | Set By | Notes |
|----------|------|--------|-------|
| `type` | `'submission'` | submit command | Required. |
| `quest_id` | string | submit command | Target task: ID. |
| `submitted_by` | string | submit command | Principal ID. |
| `submitted_at` | number | submit command | Timestamp. |

**Status is COMPUTED, never stored.** Derived from decisions + effective review verdicts:
- Has merge decision → `MERGED`
- Has close decision → `CLOSED`
- Any effective `request-changes` verdict → `CHANGES_REQUESTED`
- ≥1 effective `approve` verdict → `APPROVED`
- Otherwise → `OPEN`

**Edges:**
- `submits` → task: (the quest)
- Incoming `has-patchset` from patchset:
- Incoming `decides` from decision:

---

### Patchset (`patchset:*`)

| Property | Type | Set By | Notes |
|----------|------|--------|-------|
| `type` | `'patchset'` | submit/revise | Required. |
| `description` | string | submit/revise | ≥10 chars. |
| `workspace_ref` | string | submit/revise | Git branch/workspace. |
| `authored_by` | string | submit/revise | Principal ID. |
| `authored_at` | number | submit/revise | Timestamp. |
| `base_ref` | string | submit/revise | Base branch (e.g., `main`). |
| `head_ref` | string | submit/revise | HEAD commit SHA. |
| `commit_shas` | string | submit/revise | Comma-separated list. |

**Tip patchset:** The patchset with no incoming `supersedes` edge (latest in chain).

**Edges:**
- `has-patchset` → submission:
- `supersedes` → patchset: (previous version, if revision)
- Incoming `reviews` from review:

---

### Review (`review:*`)

| Property | Type | Set By | Notes |
|----------|------|--------|-------|
| `type` | `'review'` | review command | Required. |
| `verdict` | ReviewVerdict | review command | Required. |
| `comment` | string | review command | Feedback text. |
| `reviewed_by` | string | review command | Principal ID. |
| `reviewed_at` | number | review command | Timestamp. |

**Valid verdicts:** `'approve'`, `'request-changes'`, `'comment'`

**Effective verdict:** Latest review per reviewer (by max(`reviewed_at`, id)). `'comment'` verdicts are excluded from status computation.

**Edges:** `reviews` → patchset:

---

### Decision (`decision:*`)

`decision:*` is a shared family across review settlement and case judgment.
`type: 'decision'` identifies the family. `decision_scope` disambiguates
case-scoped semantics when needed.

| Property | Type | Set By | Notes |
|----------|------|--------|-------|
| `type` | `'decision'` | merge/close/case judgment | Required. Distinguishes from legacy concept/decision nodes. |
| `kind` | string | merge/close/case judgment | Submission scope currently uses `'merge'` or `'close'`; case scope currently uses `'adopt'`, `'reject'`, `'defer'`, or `'request-evidence'`. |
| `decision_scope` | string | case judgment | Optional. Current explicit value is `'case'`; omission currently implies legacy submission-scoped decision semantics. |
| `case_id` | string | case judgment | Required for case-scoped decisions. |
| `decided_by` | string | merge/close/case judgment | Principal ID. |
| `decided_at` | number | merge/close/case judgment | Timestamp. |
| `rationale` | string | merge/close/case judgment | Required explanation. |
| `merge_commit` | string | merge | Optional Git merge commit SHA for submission merge decisions. |
| `expected_delta` | string | case judgment | Optional durable statement of the intended outcome. |
| `follow_on_artifact_id` | string | case judgment | Optional linked quest/proposal or other follow-on artifact. |
| `follow_on_artifact_kind` | string | case judgment | Optional artifact-kind label for the linked follow-on artifact. |

**Edges:**
- `decides` → `submission:` or `case:` (required)
- optional `causes` → follow-on artifact created or explicitly caused by the decision

## 5. Edge Traversal Patterns

```
task: --authorized-by--> intent:
intent: --decomposes-to--> story: --decomposes-to--> req: --has-criterion--> criterion:
task: --implements--> req:
evidence: --verifies--> criterion:
evidence: --implements--> req: (auxiliary auto-link)
task: --belongs-to--> campaign: <-governs-- policy:
task: --depends-on--> task:
config:xyph (singleton, no canonical edges)

suggestion: --suggests--> req:/criterion:/target:
suggestion: --relates-to--> any-node:
case: --opened-from--> suggestion:/artifact:
case: --concerns--> any-node:
brief: --briefs--> case:
brief: --documents--> any-node:

submission: --submits--> task:
patchset: --has-patchset--> submission: <-decides-- decision:
review: --reviews--> patchset: --supersedes--> patchset:
decision: --decides--> case:
decision: --causes--> task:/proposal:/other-artifact: (optional)
artifact: --fulfills--> task:
```

![Entity-relationship diagram](../diagrams/entity-relationship.svg)

## 6. Conflict Resolution (LWW)

XYPH uses **Last-Writer-Wins (LWW)** for all node properties.
Each property write carries an **EventId** — a 4-tuple that provides a global total order:

1. **Lamport timestamp** — per-writer monotonic counter assigned per patch.
2. **writerId** — lexicographic tie-break when Lamport timestamps are equal.
3. **patchSha** — tie-break when writer and Lamport are both equal.
4. **opIndex** — tie-break within a single patch (operation order).

Conflicts are resolved by comparing the complete EventId lexicographically. The write with the greater EventId wins.

**Important:** The EventId tuple is compared lexicographically: Lamport timestamp first. If writer Y's Lamport timestamp is higher than writer X's, writer Y wins — regardless of writer identity. The `writerId` field is only a tie-breaker when two writes have the same Lamport timestamp (which happens when patches are created concurrently before observing each other's clocks). This ensures a global total order across all writers.

## 7. Non-Examples (Invalid)

- `BDK-001`: Missing prefix.
- `TASK:BDK-001`: Uppercase prefix.
- `task:`: Empty identifier.
- `unknown:ID`: Prefix not in taxonomy.
