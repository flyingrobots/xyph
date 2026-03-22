# XYPH Current Active Plan

**Status:** Active implementation direction.

This is the current working direction for XYPH. If older docs or workflow guidance conflict with this document and the canonical design docs it references, this direction wins until explicitly replaced.

## Summary

XYPH is being redesigned around a **sovereign ontology**:
- XYPH owns the public concepts
- git-warp is the graph/history substrate
- Alfred is optional edge plumbing only
- observer profiles do **not** grant authority by existing

The canonical control-plane model is:
- `observe`
- `history`
- `diff`
- `explain`
- `fork_worldline`
- `braid_worldlines`
- `compare_worldlines`
- `attest`
- `collapse_worldline`
- `apply`
- `propose`
- `comment`

Human surface direction:
- TUI first
- Web second
- CLI trends toward `xyph api` plus bootstrap/debug/admin surfaces
- BIJOU 3.1.0 is now the active TUI foundation, and the current shell is an AION-style landing cockpit with `Now`, `Plan`, `Review`, `Settlement`, `Campaigns`, and `Graveyard` lanes over one inspector-first operator surface plus drill-in item pages
- the current product-design source of truth for that human surface now lives in [`docs/AION_PRODUCT_DESIGN.md`](../AION_PRODUCT_DESIGN.md), using IBM Design Thinking concepts such as sponsor users, hills, and playbacks to shape pages, capabilities, and attention flow

## Current Implementation Order

1. **git-warp substrate first**
   - Current paired substrate plan lives in the `git-warp` repo at `docs/plans/conflict-analyzer-v1.md`.
   - git-warp must expose conflict/counterfactual facts before XYPH builds higher-level compare/collapse/debugger semantics on top.
2. **XYPH consumes substrate truth**
   - XYPH should not invent conflict provenance above incomplete substrate signals.
   - `xyph api observe` now exposes a substrate-backed `conflicts` projection that relays git-warp conflict facts directly for the live frontier or a derived worldline's backing working-set tip.
   - `xyph api compare_worldlines` now exposes the published git-warp coordinate comparison surface for live-vs-derived and derived-vs-derived preview, carries both the operationally scoped and raw whole-graph git-warp comparison facts through the substrate block, and can persist durable `comparison-artifact:*` governance records on `worldline:live` without perturbing the operational freshness digest.
   - `xyph api collapse_worldline` now exposes the first governed settlement runway over published git-warp transfer planning, requiring a fresh `comparison-artifact` digest, previewing or executing through the shared mutation kernel, gating live execution on approving attestations over the persisted `comparison-artifact:*`, lowering committed content-clearing transfer ops through published git-warp patch primitives, carrying git-warp’s exported comparison/transfer facts through the substrate block, and optionally recording a durable `collapse-proposal:*` governance node on `worldline:live`.
   - Persisted governance artifacts now have readable XYPH lifecycle semantics: `observe(entity.detail)` computes freshness, attestation summary, and supersession lineage for durable `comparison-artifact:*` and `collapse-proposal:*` nodes instead of exposing only raw graph properties.
   - `xyph api query` now exposes the first admin-only governance read model, with a live worklist view for actionable compare/collapse artifacts and a per-artifact series-history view over durable governance lanes.
   - `xyph api explain` now diagnoses durable governance artifacts directly, returning stable reason codes and next-command guidance for stale comparisons, blocked collapse proposals, and the distinction between attesting a proposal and approving the bound comparison gate.
   - The TUI now projects those same durable governance artifacts into the BIJOU 3.1-powered `Settlement` lane of the AION cockpit, so compare/collapse/attestation work can be scanned in the main worklist and inspected without dropping to raw JSON first.
   - Conflict meaning, governance, compare/collapse, and human workflow semantics remain XYPH concerns.
3. **Worldline working sets after substrate facts**
   - Fork/worldline work should use logical working sets over graph observations, not Git worktrees.
   - Materialized graph states are caches, not authoritative models.
   - `fork_worldline` is now implemented as a thin mapping onto git-warp working-set creation for `worldline:live`, with optional current-frontier Lamport ceiling support via `at: { tick }`.
   - `braid_worldlines` is now implemented as a thin mapping onto git-warp braid descriptors for canonical derived worldlines, using `supportWorldlineIds` and optional `readOnly` while keeping the public API worldline-first.
   - Canonical derived worldlines now support working-set-backed `observe(graph.summary)`, `observe(worldline.summary)`, `observe(entity.detail)`, `history`, `diff`, `apply`, `observe(conflicts)`, `compare_worldlines`, and governed `collapse_worldline` slices.
   - Observation coordinates for those slices now make the substrate backing explicit, including braid support-worldline IDs when the selected worldline is braided.
   - `observe(conflicts)` now warns when braided overlays are fighting over singleton LWW properties in a way that self-erases co-presence in the application projection.
   - `braid_worldlines` is the canonical composition verb: multiple worldline-derived effects kept co-present rather than silently merged or rebased.
   - Arbitrary historical frontiers, derived-from-derived forking, and broader compatibility-projection parity remain future slices.

## Canonical Docs

For detailed implementation truth, use these first:
- `docs/canonical/ARCHITECTURE.md`
- `docs/canonical/WIRE_PROTOCOL_V0.md`
- `docs/canonical/AUTHORITY_MODEL.md`
- `docs/canonical/ARTIFACT_MUTATION_SEMANTICS.md`

## Guardrails

- Do not re-open the sovereign ontology direction casually.
- Do not add new XYPH conflict/counterfactual truth that belongs in git-warp.
- Do not treat older actuator-centric workflow docs as canonical where they conflict with the current control-plane redesign.
