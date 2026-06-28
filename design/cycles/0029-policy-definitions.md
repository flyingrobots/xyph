# 0029: Policy Definitions (DoD Campaign Governance)

## Cycle Type

Refactoring & Architectural Alignment cycle

## Status

Proposing Design — Paused for operator review of the `DoDOptic` abstraction.

## Graph Anchor

- Work item: `task:TRC-009`
- Legend: TRACEABILITY (functional & governance mapping)

## Why This Cycle Exists

The schema definitions, domain models, and CLI command surfaces for Definition of Done (DoD) policies (`policy:*` node type and `governs` edge type) are already implemented in `src/domain/entities/Policy.ts` and `src/cli/commands/traceability.ts`.

However, the current codebase performs read operations (in `ObservedGraphProjection.ts`) and write operations (in `src/cli/commands/traceability.ts`) directly via raw graph property mutations and queries. To align with Shift I of our target architecture (Bounded Optics), we must introduce **`DoDOptic`**.

`DoDOptic` acts as a clean, bounded data access layer ("optic") that encapsulates all graph reads and writes relating to campaign DoD rules, shielding high-level features and adapters from raw CRDT property mechanics.

## Sponsor Actors

### Primary Sponsor Actor

**Governance Reviewer**

Needs absolute assurance that campaign DoD rules are parsed, validated, and evaluated correctly without structural anomalies or data leakage.

### Secondary Sponsor Actor

**Application Integrator**

Needs a clean, modular API (an Optic) to query and attach DoD policies, without writing ad-hoc graph walks or property setters.

## Outcome Hill

**As an integrator, I want to use DoDOptic to read and write Definition of Done rules on the WARP graph, replacing raw property queries/mutations with a bounded capability-aware interface, while ensuring 100% behavioral parity.**

## Invariants

This cycle must preserve:
- The public CLI command syntax and options for `policy` and `govern`.
- Complete compatibility of outputs for `GraphSnapshot` and `EntityDetail` types (no changes to caller-facing TUI/CLI APIs).
- The validation constraints of `Policy` (e.g. threshold boundaries).

## Scope

### In Scope
- Define the `DoDOptic` class in `src/domain/optics/DoDOptic.ts` wrapping read (`GraphReader`) and write (`GraphPatcher`) capabilities.
- Refactor `ObservedGraphProjection.ts` (specifically `loadPoliciesForCampaign`) to retrieve policies via `DoDOptic`.
- Refactor `src/cli/commands/traceability.ts` (specifically the `policy` and `govern` actions) to create and associate policies via `DoDOptic`.
- Add unit tests for `DoDOptic` in `test/unit/DoDOptic.test.ts`.

### Out of Scope
- Implementing computed completion rollup logic (task:TRC-010).
- Gating seal/merge commands based on policies (task:TRC-011).

## Acceptance-Test Plan

### Checkpoint 1: Clean build and lint
1. Running `npm run lint` and `npm run build` must be completely clean with zero errors.

### Checkpoint 2: All tests pass
2. Running `npm run test:local` must succeed with all 1008+ tests passing.

### Checkpoint 3: CLI Verification
3. Instantiating a test policy and governs relationship via the CLI:
   ```bash
   npx tsx xyph.ts policy policy:TEST-POLICY --campaign campaign:TRACE
   ```
   Must successfully construct the policy node and link it via `DoDOptic`.

## Proposed Interface: `DoDOptic`

```typescript
export interface NeighborEntry {
  nodeId: string;
  label: string;
}

export interface GraphReader {
  getNodeProps(id: string): Promise<Record<string, unknown> | null>;
  neighbors(id: string, direction: 'outgoing' | 'incoming'): Promise<NeighborEntry[]>;
}

export interface GraphPatcher {
  patch(fn: (p: any) => void): Promise<string>;
}

export class DoDOptic {
  constructor(
    private readonly reader: GraphReader,
    private readonly patcher?: GraphPatcher,
  ) {}

  public async getPolicy(policyId: string): Promise<Policy | null> { ... }
  public async getPoliciesForCampaign(campaignId: string): Promise<Policy[]> { ... }
  public async createPolicy(policyId: string, campaignId: string, props: Omit<PolicyProps, 'id'>): Promise<string> { ... }
  public async governCampaign(policyId: string, campaignId: string): Promise<string> { ... }
}
```

## Playback Questions

1. Did we successfully abstract all raw property reads and writes of policies/governs edges into `DoDOptic`?
2. Do all existing tests pass green under the new optic boundary?
3. Did we successfully claim and seal `task:TRC-009`?

## Exit Criteria

This cycle closes when:
- `DoDOptic` is implemented and integrated.
- All unit and integration tests pass cleanly.
- `task:TRC-009` is marked as `DONE` and sealed.
- Design cycle status is updated to completed.
