# M11 Phase 3: Computed Status Propagation

## Overview

Phase 3 replaces manual quest completion flags with **graph-computed status**.
A quest is DONE when its requirements are met, its criteria are evidenced, and
its campaign's Definition of Done (DoD) policy is satisfied. This is not a
heuristic — it's a deterministic query over the traceability chain.

## Traceability Chain (established in Phases 1–2)

```
intent
  └── decomposes-to → story
        └── decomposes-to → requirement
              └── has-criterion → criterion
                    └── verifies ← evidence
```

Each layer rolls up to the one above. Status propagates bottom-up:
evidence → criterion → requirement → story → quest.

## Status Propagation Rules

### Criterion Status

A criterion is **satisfied** when:
- At least one `evidence` node links to it via a `verifies` edge
- That evidence has `result: 'pass'`
- The criterion has `verifiable: true`

A criterion with `verifiable: false` is informational and always counts as
satisfied (documentation, design notes).

A criterion with only `result: 'fail'` evidence is **unsatisfied**.

### Requirement Status

A requirement is **met** when:
- All its criteria (via `has-criterion` edges) are satisfied
- It has at least one criterion (a requirement with zero criteria is **unmet**)

Coverage ratio = `satisfied_criteria / total_criteria`.

### Story Status

A story is **complete** when all its requirements (via `decomposes-to` edges)
are met. A story with zero requirements is **incomplete** (it needs
decomposition).

### Quest Status

A quest's computed status depends on the campaign's DoD policy (see below).
Without a policy, the default rule is: a quest is **DONE** when all its
associated stories are complete.

## TRC-009: Policy Nodes

```
policy:<campaign-id>     (type: 'policy')
  └── governs → campaign:<id>
```

A policy node defines the Definition of Done for a campaign. Properties:

| Property             | Type       | Description                                    |
|----------------------|------------|------------------------------------------------|
| `coverageThreshold`  | `number`   | Minimum coverage ratio (0.0–1.0). Default: 1.0 |
| `requireAllCriteria` | `boolean`  | All criteria must pass, not just threshold      |
| `requireEvidence`    | `boolean`  | At least one evidence per criterion required    |
| `allowManualSeal`    | `boolean`  | Can `seal` bypass DoD? Default: false           |

A campaign without a policy inherits a strict default:
`{ coverageThreshold: 1.0, requireAllCriteria: true, requireEvidence: true, allowManualSeal: false }`.

## TRC-010: Computed DONE Status

Replace the manual `status: 'DONE'` flag with a graph query:

```typescript
function isQuestDone(questId: string, graph: WarpGraph): boolean {
  const stories = graph.query()
    .match(questId)
    .outgoing('decomposes-to', { depth: [1, 1] })
    .run();

  for (const story of stories) {
    const reqs = getRequirements(story.id, graph);
    for (const req of reqs) {
      const coverage = computeCoverageRatio(getCriteria(req.id, graph));
      const policy = getPolicy(questId, graph);
      if (coverage.ratio < policy.coverageThreshold) return false;
    }
  }
  return true;
}
```

The `status --view roadmap` output would show computed status alongside the
manually-set status, flagging discrepancies.

## TRC-011: Hard-Gate in Seal/Merge

When `seal` or `merge` is invoked:

1. Resolve the quest's campaign → find the `policy` node
2. Compute coverage for all the quest's requirements
3. If DoD is not satisfied:
   - `seal`: reject with error listing unmet criteria
   - `merge`: reject with error listing unmet criteria
   - Both: suggest `--force` flag (requires `allowManualSeal: true` in policy)

The gate runs in `validateSeal()` / `validateMerge()` before the mutation
is committed. No partial writes — fail before any graph patch.

## TRC-012: Constraint, Risk, and Spike Nodes

New node types for capturing non-functional concerns:

| Type         | Prefix         | Purpose                                   |
|--------------|----------------|-------------------------------------------|
| `constraint` | `constraint:`  | Hard limits (performance, compliance)      |
| `assumption` | `assumption:`  | Stated assumptions that may prove false    |
| `risk`       | `risk:`        | Identified risks with likelihood/impact    |
| `spike`      | `spike:`       | Time-boxed investigations                  |

Edge types:
- `constrains`: constraint → requirement
- `assumes`: assumption → story/requirement
- `threatens`: risk → quest/story
- `investigates`: spike → risk/assumption

These participate in gap detection (TRC-013) but do not affect computed status
directly. A risk with no mitigation is a gap, not a blocker.

## TRC-013: Gap Detection Queries

Queries that surface incomplete traceability:

| Query                    | What it finds                                       |
|--------------------------|-----------------------------------------------------|
| **Orphan requirements**  | Requirements with zero criteria                     |
| **Untested criteria**    | Criteria with zero passing evidence                 |
| **Unlinked tests**       | Test files not linked to any criterion/requirement  |
| **Unmitigated risks**    | Risks with no associated spike or constraint        |
| **Unstated assumptions** | Stories/reqs with no assumptions (informational)    |
| **Coverage gaps**        | Campaigns below their policy's coverage threshold   |

These power the `status --view trace` output and the dashboard alerts.

## Dependency Chain

```
TRC-009 (Policy nodes)
  └── blocks → TRC-010 (Computed status)
        └── blocks → TRC-011 (Hard-gate seal/merge)

TRC-012 (Constraint/risk/spike types)  ── parallel track
  └── blocks → TRC-013 (Gap detection)
```

TRC-009 → TRC-010 → TRC-011 is sequential: you need policies before you can
compute status, and you need computed status before you can gate on it.

TRC-012 → TRC-013 is a parallel track: new node types enable new queries,
but neither depends on the policy/status chain.

## Implementation Notes

- **Pure functions**: All computation lives in `TraceabilityAnalysis.ts` (or a
  new `ComputedStatus.ts` service). No graph mutations — read-only queries.
- **Caching**: Computed status is derived, not stored. Materialize once per
  command invocation, not per query.
- **Backward compatibility**: Quests without stories/requirements keep their
  manual status. Computed status only activates when the traceability chain
  exists for a quest.
- **Existing functions**: `computeUnmetRequirements()`, `computeUntestedCriteria()`,
  and `computeCoverageRatio()` in `TraceabilityAnalysis.ts` are the foundation.
  TRC-010 wraps these with story→quest rollup logic.
