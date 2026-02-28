# GRAPH SCHEMA
**Version:** 2.0.0
**Status:** AUTHORITATIVE

## 1. Node ID Grammar

Every node ID MUST follow the `prefix:identifier` format.
- **Prefix:** Lowercase string from the allowed taxonomy (Section 2).
- **Identifier:** Case-preserving alphanumeric string (dashes and underscores allowed).

Example: `task:BDK-001`, `campaign:BEDROCK`, `submission:abc123`

## 2. Prefix Taxonomy

### Active Prefixes (used by actuator and graph queries)

| Prefix | Node Type | Purpose | Example |
|--------|-----------|---------|---------|
| `task` | Quest | Granular unit of work. | `task:BDK-001` |
| `campaign` | Campaign | High-level milestone or epoch. | `campaign:BEDROCK` |
| `milestone` | Campaign | Alias for campaign (legacy). | `milestone:M1` |
| `intent` | Intent | Sovereign human declaration of purpose. | `intent:SOVEREIGNTY` |
| `artifact` | Scroll | Sealed output of completed quest. | `artifact:task:BDK-001` |
| `approval` | ApprovalGate | Formal human approval requirement. | `approval:cp-001` |
| `submission` | Submission | Review lifecycle envelope. | `submission:abc123` |
| `patchset` | Patchset | Immutable proposed change snapshot. | `patchset:def456` |
| `review` | Review | Per-reviewer verdict on a patchset. | `review:ghi789` |
| `decision` | Decision | Terminal merge or close event. | `decision:jkl012` |

### Reserved Prefixes (in schema, not actively used by actuator)

| Prefix | Purpose |
|--------|---------|
| `roadmap` | Root container. |
| `feature` | Groups of related tasks. |
| `spec` | Formal requirement or design doc. |
| `adr` | Architecture decision record. |
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
| `fulfills` | artifact → task | Scroll is the sealed output of a quest. |
| `submits` | submission → task | Submission proposes work for a quest. |
| `has-patchset` | patchset → submission | Patchset belongs to a submission. |
| `supersedes` | patchset → patchset | New patchset replaces old one. |
| `reviews` | review → patchset | Review evaluates a patchset. |
| `decides` | decision → submission | Terminal decision resolves a submission. |
| `approves` | approval → (target) | Approval gate grants permission. |

### Reserved Edge Types (in schema, not actively queried)

| Edge Label | Meaning |
|------------|---------|
| `implements` | Code fulfills a requirement. |
| `augments` | Extends or enhances another node. |
| `relates-to` | General association. |
| `blocks` | Forward dependency (inverse of depends-on). |
| `consumed-by` | Resource consumption. |
| `documents` | Documentation link. |

## 4. Node Property Contracts

All properties use **snake_case** in the WARP graph. Timestamps are Unix epoch numbers.

### Quest (`task:*`)

| Property | Type | Set By | Notes |
|----------|------|--------|-------|
| `type` | `'task'` | quest command | Required. |
| `title` | string | quest command | ≥5 chars. |
| `status` | QuestStatus | lifecycle | See valid values below. |
| `hours` | number | quest command | ≥0, default 0. |
| `assigned_to` | string | claim command | Principal ID (e.g., `agent.hal`). |
| `claimed_at` | number | claim command | Timestamp. |
| `completed_at` | number | seal/merge | Timestamp. |
| `origin_context` | string | ingest | Optional provenance. |
| `suggested_by` | string | inbox command | Who suggested it. |
| `suggested_at` | number | inbox command | Timestamp. |
| `rejected_by` | string | reject command | Who rejected it. |
| `rejected_at` | number | reject command | Timestamp. |
| `rejection_rationale` | string | reject command | Non-empty rationale. |
| `reopened_by` | string | reopen command | Who reopened it. |
| `reopened_at` | number | reopen command | Timestamp. |

**Valid QuestStatus values:** `BACKLOG`, `PLANNED`, `IN_PROGRESS`, `BLOCKED`, `DONE`, `GRAVEYARD`

Legacy: `INBOX` is normalized to `BACKLOG` at read time.

**Edges:**
- `belongs-to` → campaign:/milestone: (optional)
- `authorized-by` → intent: (required for BACKLOG+)
- `depends-on` → task: (optional, Weaver)

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
| `guild_seal_alg` | string | GuildSealService | `'Ed25519'` if signed. |
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

| Property | Type | Set By | Notes |
|----------|------|--------|-------|
| `type` | `'decision'` | merge/close | Required. Distinguishes from legacy concept/decision nodes. |
| `kind` | DecisionKind | merge/close | `'merge'` or `'close'`. |
| `decided_by` | string | merge/close | Principal ID. |
| `decided_at` | number | merge/close | Timestamp. |
| `rationale` | string | merge/close | Required explanation. |
| `merge_commit` | string | merge | Git merge commit SHA. |

**Edges:** `decides` → submission:

## 5. Edge Traversal Patterns

```
intent: ←authorized-by← task: ─belongs-to─→ campaign:
                           │
                           ├──depends-on──→ task:
                           │
                           ←submits── submission: ←decides── decision:
                                          │
                                          ←has-patchset── patchset: ←reviews── review:
                                                              │
                                                              ─supersedes─→ patchset:
                           │
                           ←fulfills── artifact: (scroll)
```

## 6. Conflict Resolution (LWW)

XYPH uses **Last-Writer-Wins (LWW)** for all node properties.
The winner is determined by:
1. Higher Lamport timestamp (per-writer, not global).
2. Tie-break: Lexicographically greater `writerId`.
3. Tie-break: Greater patch SHA.

**Important:** To override a property set by writer X, the new write MUST come from writer X (to get a higher tick in X's sequence). A write from writer Y at a lower tick will lose.

## 7. Non-Examples (Invalid)

- `BDK-001`: Missing prefix.
- `TASK:BDK-001`: Uppercase prefix.
- `task:`: Empty identifier.
- `unknown:ID`: Prefix not in taxonomy.
