# TRACEABILITY — Requirements-to-Evidence Graph Model
**Version:** 0.1.0
**Status:** DRAFT
**Depends on:** GRAPH_SCHEMA.md, DATA_CONTRACTS.md, ROADMAP_PROTOCOL.md

## 1. Motivation

ROADMAP_PROTOCOL.md states: DONE means "acceptance criteria met, evidence attached."
DATA_CONTRACTS.md specifies `userStory` on every task.
VISION_NORTH_STAR.md declares: "trust, tests, and deployment safety are cryptographically provable."

None of this is implemented. This document specifies the graph model that makes it real.

## 2. The Traceability Chain

```
Intent (human desire — "why this matters")
  └─ Story (user perspective — "who wants what, and why")
       └─ Requirement (specific need — "what must be true")
            └─ Criterion (testable condition — "how we verify it")
                 └─ Evidence (proof — test result, benchmark, hash, screenshot)
```

A **Task** (Quest) is the work unit. It does not replace this chain — it `implements`
one or more Requirements. The task is the labor; the chain is the spec.

**Definition of Done** is a Policy node governing a Campaign or the whole project.
A task is DONE when:
1. All linked Criteria have fresh Evidence (per-task completeness)
2. The governing Policy's conditions are satisfied (campaign-level gates)

`status: DONE` becomes a **computed property**, not a manually-set flag.

## 3. New Node Types

| Prefix | Type | Purpose | Key Properties |
|--------|------|---------|----------------|
| `story:` | Story | User-facing narrative | `persona`, `goal`, `benefit`, `created_by`, `created_at` |
| `req:` | Requirement | Specific functional or non-functional need | `description`, `kind` (functional / non-functional), `priority` |
| `criterion:` | Criterion | Single testable condition | `description`, `verifiable` (bool) |
| `evidence:` | Evidence | Proof a criterion is met | `kind` (test / benchmark / manual / screenshot), `result` (pass / fail), `produced_at`, `produced_by`, `artifact_hash` |
| `constraint:` | Constraint | Non-functional boundary (perf, security, compat) | `description`, `threshold`, `unit` |
| `assumption:` | Assumption | Believed-true condition that could invalidate work | `description`, `validated` (bool), `validated_at` |
| `risk:` | Risk | Known unknown with impact assessment | `description`, `likelihood`, `impact`, `mitigation` |
| `spike:` | Spike | Time-boxed investigation producing knowledge | `timebox_hours`, `outcome` |
| `policy:` | Policy | Definition of Done / campaign-level rules | `conditions[]` |

## 4. New Edge Types

| Type | Direction | Meaning |
|------|-----------|---------|
| `decomposes-to` | Intent → Story, Story → Requirement | Hierarchical refinement |
| `has-criterion` | Requirement → Criterion | What must be proven |
| `verifies` | Evidence → Criterion | Proof link |
| `implements` | Task → Requirement | Work-to-spec traceability (already in GRAPH_SCHEMA.md) |
| `constrains` | Constraint → Requirement or Campaign | Boundary condition |
| `assumes` | Assumption → Task or Requirement | Validity dependency |
| `threatens` | Risk → Task or Requirement | Known danger |
| `informs` | Spike → Requirement | Investigation produces spec |
| `governs` | Policy → Campaign | Definition of Done scope |

## 5. Computed Queries

With this model, the graph can answer:

| Query | Method |
|-------|--------|
| **Is this task done?** | All linked criteria have passing evidence + policy satisfied |
| **What requirements are unmet?** | Requirements where any criterion lacks passing evidence |
| **What's untested?** | Criteria with no `verifies` edge from any evidence node |
| **What broke?** | Evidence nodes with `result: fail` → trace back to criterion → requirement → story → intent |
| **What's at risk?** | Tasks with unvalidated assumptions |
| **What's the spec coverage?** | Ratio of criteria with evidence vs. without |
| **What tests should exist?** | Criteria with `verifiable: true` but no evidence |
| **What's ready to work on?** | Deps clear + requirements specified + no blocking risks + no unvalidated assumptions |

## 6. Test Annotation Convention

Source-level annotations link test code to graph criteria:

```typescript
// @xyph criterion:expired-tokens-rejected
it('rejects requests with expired JWT', () => { ... });
```

Multi-criterion:
```typescript
// @xyph criterion:auth-returns-401, criterion:error-body-includes-reason
it('returns 401 with descriptive error for expired tokens', () => { ... });
```

A `xyph scan` command walks test files, extracts annotations, and writes
Evidence nodes + `verifies` edges into the graph. Running in CI keeps
the traceability chain current automatically.

## 7. Auto-ID Convention

All node IDs are auto-generated using the `prefix:` + sortable timestamp + random suffix
pattern (see `generateId()` in the actuator). Human-readable identification comes from
the `title` property and graph edges, not the ID string.

This eliminates naming convention overhead (no more WVR-, SOV-, BX- prefixes) and
allows nodes to move between campaigns without identity conflicts.

## 8. Relationship to Existing Specs

| Existing spec | What changes |
|---------------|-------------|
| **GRAPH_SCHEMA.md** | Add new prefixes (story, req, criterion, evidence, constraint, assumption, risk, spike, policy) and edge types to taxonomy |
| **DATA_CONTRACTS.md** | Task entity gains `userStory` as a graph edge (story node) instead of inline string; `estimates.confidence` applies to requirements too |
| **ROADMAP_PROTOCOL.md** | DONE becomes computed; BLOCKED gains nuance (dep-blocked vs. assumption-blocked vs. risk-blocked) |
| **TEST_STRATEGY.md** | Coverage classes map to criterion types; fuzz targets become risk nodes |
| **VISION_NORTH_STAR.md** | "Verified artifacts" and "cryptographically provable" are realized through the evidence chain |

## 9. Implementation Phases

**Phase 1 — Foundation:** Auto-generated IDs, `description` field on tasks, `story:` and `req:` node types, `implements` edges.

**Phase 2 — Criteria & Evidence:** `criterion:` and `evidence:` nodes, `has-criterion` and `verifies` edges, `xyph scan` command.

**Phase 3 — Computed Status:** DONE as graph query, Policy nodes, Definition of Done enforcement.

**Phase 4 — Intelligence:** Gap detection ("what's untested?"), risk/assumption tracking, suggested tests from unverified criteria.

## 10. Open Questions

- Should Evidence nodes be immutable (append-only results) or mutable (latest run overwrites)?
  Recommendation: immutable — history of pass/fail over time is valuable.
- How granular should policies be? Per-campaign? Per-task-type? Inherited?
- Should `xyph scan` run as a git hook, CI step, or explicit command? (Probably all three.)
- How do we handle manual acceptance criteria that can't be automated?
  A `kind: manual` evidence node with a human attestation + signature.
