# 0029: Policy Definitions (DoD Campaign Governance)

## Cycle Type

Refactoring & Architecture Verification cycle

## Status

Proposing Design — Paused for operator review.

## Graph Anchor

- Work item: `task:TRC-009`
- Legend: TRACEABILITY (functional & governance mapping)

## Why This Cycle Exists

The schema definitions, domain models, and CLI command surfaces for Definition of Done (DoD) policies (`policy:*` node type and `governs` edge type) are already implemented in `src/domain/entities/Policy.ts` and `src/cli/commands/traceability.ts`.

However, the task `task:TRC-009` remains open in the intent graph. This cycle exists to:
1. Formally verify the existing policy definition and association features (`xyph policy` and `xyph govern` commands) under realistic graph workloads.
2. Confirm the graph materialization and query paths correctly project policy properties (`coverageThreshold`, `requireAllCriteria`, `requireEvidence`, `allowManualSeal`) and association links (`policy` governs `campaign`).
3. Ensure no regressions or code debt exist in the policy module before starting computed done rollups (`task:TRC-010`) and hard-gating seals (`task:TRC-011`).
4. Resolve, claim, and seal `task:TRC-009` with a project scroll.

## Sponsor Actors

### Primary Sponsor Actor

**Governance Reviewer**

Needs absolute clarity on what DoD policy governs a campaign, and whether a quest meets that policy before sealing or merging.

### Secondary Sponsor Actor

**Program Steward**

Needs to see the current coverage ratios and gaps across all active campaigns to gauge organizational progress.

## Outcome Hill

**As a governance reviewer, I want policy nodes and governs edges to successfully define campaign-level Definition of Done rules, ensuring they are fully verified by tests and projected clearly in graph snapshots without any structural anomalies.**

## Invariants

This cycle must preserve:
- The `Policy` entity class signature and validation logic.
- The `xyph policy` and `xyph govern` CLI command structures and parameter options.
- The `loadTraceabilityForQuest` and `loadPoliciesForCampaign` methods in `ObservedGraphProjection.ts`.
- Bit-identical outputs for all existing tests (1000+ tests).

## Scope

### In Scope
- Formally document the cycle design under `design/cycles/0029-policy-definitions.md`.
- Verify validation logic for the `Policy` entity class in `test/unit/Policy.test.ts`.
- Verify integration mapping for policy nodes and campaign-governing edges in `test/integration/WarpTraceabilityAdapter.test.ts`.
- Generate project scroll and mark `task:TRC-009` as `DONE` in the graph.

### Out of Scope
- Implementing computed completeness checks or story rollups (addressed in `task:TRC-010`).
- Gating seal/merge commands based on policies (addressed in `task:TRC-011`).

## Acceptance-Test Plan

### Checkpoint 1: Clean build and lint
1. Running `npm run lint` and `npm run build` must be completely clean with zero errors.

### Checkpoint 2: All tests pass
2. Running `npm run test:local` must succeed with all 1008+ tests passing.

### Checkpoint 3: CLI Verification
3. Create a test policy and governs relationship:
   ```bash
   npx tsx xyph.ts policy policy:TEST-POLICY --campaign campaign:TRACE
   ```
   Must successfully construct the policy node and link it.

## Playback Questions

1. Do the `xyph policy` and `xyph govern` commands successfully write valid CBOR patches to the graph?
2. Are the properties of the policy node correctly read and populated inside the graph projection snapshots?
3. Does the test suite cover validation constraints of policy properties (such as threshold limits)?

## Exit Criteria

This cycle closes when:
- `task:TRC-009` is claimed, verified, and sealed in the graph.
- Design cycle status is updated to completed.
