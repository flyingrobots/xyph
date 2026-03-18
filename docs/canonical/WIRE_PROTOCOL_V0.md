# WIRE PROTOCOL V0
**Version:** 0.1.0
**Status:** FREEZE CANDIDATE

## Purpose

This document defines the sovereign machine-facing JSONL protocol for
`xyph api`.

The current implementation provides a real foundation slice. Not every reserved
command is implemented yet, but the envelope shape, event framing, observation
coordinate, and error taxonomy are fixed enough to build against deliberately.

## Transport

`xyph api` reads newline-delimited JSON request envelopes from stdin and emits
newline-delimited JSON event and terminal result records on stdout.

Per request:

- zero or more event records may be emitted
- exactly one terminal success or error record must be emitted

## Request Envelope

```json
{
  "v": 1,
  "id": "req-1",
  "cmd": "observe",
  "args": {
    "projection": "graph.summary"
  },
  "auth": {}
}
```

Fields:

- `v`: protocol version
- `id`: caller-supplied request ID
- `cmd`: canonical command name
- `args`: command arguments
- `auth`: optional auth claims for the current bootstrap slice

Current bootstrap auth fields:

- `principalId`
- `admin`

## Event Record

```json
{
  "v": 1,
  "id": "req-1",
  "event": "start",
  "cmd": "observe",
  "at": 1760000000000
}
```

Current event kinds:

- `start`
- `progress`

## Terminal Success Record

```json
{
  "v": 1,
  "id": "req-1",
  "ok": true,
  "cmd": "observe",
  "data": {},
  "diagnostics": [],
  "observation": {},
  "audit": {}
}
```

## Terminal Error Record

```json
{
  "v": 1,
  "id": "req-1",
  "ok": false,
  "cmd": "observe",
  "error": {
    "code": "invalid_args",
    "message": "..."
  },
  "audit": {}
}
```

## Canonical Commands

Current command family:

- `observe`
- `explain`
- `history`
- `diff`
- `fork_worldline`
- `braid_worldlines`
- `compare_worldlines`
- `attest`
- `collapse_worldline`
- `apply`
- `propose`
- `comment`

Expert/admin-only reserved commands:

- `query`
- `rewind_worldline`

Current foundation-slice implementation status:

- implemented now: `observe`
- implemented now: `explain`
- implemented now: `history`
- implemented now: `diff`
- implemented now: `fork_worldline`
- implemented now: `braid_worldlines`
- implemented now: `compare_worldlines`
- implemented now: `collapse_worldline`
- implemented now: `apply`
- implemented now: `propose`
- implemented now: `comment`
- implemented now: `attest`
- reserved, not yet implemented: `query`
- reserved, not yet implemented: `rewind_worldline`

`snapshot_at` is not a distinct protocol command. It is a readability alias for
`observe` with an explicit `at` selector and must not gain independent
semantics.

## Observation Coordinate

Every read returns a reproducible observation coordinate:

- `worldlineId`
- `observedAt`
- `principalId`
- `principalType`
- `observerProfileId`
- `basis`
- `basisVersion`
- `aperture`
- `apertureVersion`
- `policyPackVersion`
- `capabilityMode`
- `sealedObservationMode`
- `selectorDigest`
- `frontierDigest`
- `backing`
- `graphMeta`
- optional `comparisonPolicyVersion`

`backing` makes the substrate truth explicit:

- live-backed reads report `kind: "live_frontier"` with
  `substrate.kind: "git-warp-frontier"`
- working-set-backed derived reads report `kind: "derived_working_set"` with
  substrate details for:
  - `workingSetId`
  - `baseLamportCeiling`
  - `overlayHeadPatchSha`
  - `overlayPatchCount`
  - `overlayWritable`
  - `braid.supportCount`
  - `braid.supportWorldlineIds`
  - `braid.supportWorkingSetIds`

`compare_worldlines` and preview `collapse_worldline` are the exceptions to the
single-coordinate return shape. Because they span two worldline surfaces, they
return per-side observation coordinates inside the artifact payload instead of a
single top-level `observation`.

Every read accepts:

- `at`
- optional `since`

Current selector support:

- `at: "tip"` or omitted: live frontier observation
- `at: <tick>` or `at: { "tick": <n> }`: historical observation on an
  isolated read graph
- `since: <frontierDigest>` or `since: { "frontierDigest": "..." }`: digest
  comparison
- `since: <tick>` or `since: { "tick": <n> }`: tick-based diff comparison

Current projection support by selector:

- tick-aware now: `observe(graph.summary)`, `observe(worldline.summary)`,
  `observe(entity.detail)`, `history`, `diff`
- tip-only for now: `observe(slice.local)`, `observe(context)`,
  `observe(briefing)`, `observe(next)`, `observe(submissions)`,
  `observe(diagnostics)`, `observe(prescriptions)`,
  `observe(conflicts)`

Compatibility projections that remain backed by live services reject historical
selectors with `not_implemented` rather than pretending historical support.

Canonical derived worldlines are currently supported on a narrower substrate
surface than `worldline:live`:

- working-set-aware now: `observe(graph.summary)`,
  `observe(worldline.summary)`, `observe(entity.detail)`, `history`, `diff`,
  `apply`, `observe(conflicts)`, `compare_worldlines`, `collapse_worldline`
- still live-service-backed for now: compatibility projections such as
  `briefing`, `context`, `next`, `submissions`, `diagnostics`, and
  `prescriptions`

## Substrate Conflict Projection

`observe` with `projection: "conflicts"` exposes the published read-only
git-warp conflict analyzer through the sovereign control plane.

Current behavior:

- requires `at: "tip"` or omitted
- does **not** support `since`
- respects the effective `worldlineId`
  - `worldline:live` analyzes the live frontier
  - canonical derived worldlines analyze the backing git-warp working-set tip
- accepts optional analyzer filters:
  - `lamportCeiling`
  - `entityId`
  - `target`
  - `kind`
  - `writerId`
  - `evidence`
  - `scanBudget`
- returns:
  - `requested` normalized analyzer inputs
  - `analysis` as the substrate conflict-analysis payload

When the selected derived worldline is braided, `observe(conflicts)` may also
return XYPH diagnostics warning that singleton LWW property modeling is causing
self-erasing co-presence under braid. This is an application-level warning
derived from substrate conflict facts, not a second conflict engine.

This projection is intentionally **tip-scoped** in v1. XYPH now supports
live-frontier or derived-worldline tip conflict analysis through git-warp
working sets, but arbitrary historical frontier conflict analysis remains
substrate backlog work and must not be faked by XYPH.

## `fork_worldline` Current Slice

`fork_worldline` is now implemented as a thin XYPH mapping onto git-warp working
sets.

Current behavior:

- requires `newWorldlineId`
- uses the effective `worldlineId` as the source worldline
- currently supports only `worldline:live` as that source
- accepts `at: "tip"` or omitted for live-frontier forks
- accepts `at: <tick>` or `at: { "tick": <n> }`, which currently lowers to a
  **current-frontier Lamport ceiling** in the substrate working-set API
- accepts optional `owner`, `scope`, and `leaseExpiresAt`
- returns:
  - the XYPH worldline descriptor payload
  - a substrate backing block identifying the git-warp working set

This is intentionally narrower than the long-term worldline model. Arbitrary
historical frontiers, derived-from-derived forking, and worldline-local replay
remain future slices.

## `compare_worldlines` Current Slice

`compare_worldlines` is now implemented as a read-only XYPH mapping over
git-warp's published coordinate comparison helpers.

Current behavior:

- compares the effective `worldlineId` on the left against:
  - explicit `againstWorldlineId`, or
  - `worldline:live` by default when the left side is a canonical derived
    worldline
- requires `againstWorldlineId` when the left side is already `worldline:live`
- accepts:
  - `at`
  - `againstAt`
  - optional `targetId`
- currently supports only:
  - `worldline:live`
  - canonical derived worldlines backed by git-warp working sets
- returns:
  - a typed XYPH `comparison-artifact` preview
  - per-side observation coordinates
  - substrate-backed visible patch divergence
  - substrate-backed visible node / edge / property deltas
  - optional target-local comparison details when `targetId` is provided
  - substrate comparison-fact export from git-warp in `data.substrate`

This slice is intentionally comparison-only. It does **not** collapse, approve,
or otherwise execute settlement. Comparison remains separate from decision and
execution.

## `collapse_worldline` Current Slice

`collapse_worldline` is now implemented as the first XYPH settlement runway
preview over git-warp's published transfer-planning helpers.

Current behavior:

- uses the effective `worldlineId` as the source worldline
- currently supports only canonical derived source worldlines backed by
  git-warp working sets
- requires `comparisonArtifactDigest` from a fresh `compare_worldlines` call
- recomputes the current comparison at source tip vs target tip and rejects
  stale digest input with `stale_base_observation`
- currently supports only `targetWorldlineId: "worldline:live"` or omission
- rejects `at`, `againstAt`, `since`, and `targetId` selectors in this slice
- always dry-runs through the same mutation kernel used by `apply`
- returns:
  - a typed XYPH `collapse-proposal`
  - per-side observation coordinates for source and target
  - substrate-backed transfer summary and sanitized transfer ops
  - dry-run mutation side-effect preview
  - substrate comparison-fact and transfer-fact exports from git-warp in
    `data.substrate`

This slice is intentionally preview-only. It does **not** mutate live truth
yet, and it does not introduce a special collapse engine outside the shared
mutation kernel path.

## `braid_worldlines` Current Slice

`braid_worldlines` is now implemented as a thin XYPH mapping over git-warp’s
published braid working-set substrate.

This term is intentional:

- it is **not** plain merge
- it is **not** Git rebase
- it is **not** a silent collapse of one line into another

At the protocol level, braiding means keeping multiple worldline-derived
effects visible together at one observation surface.

Current behavior:

- uses the effective `worldlineId` as the target worldline
- currently supports only canonical derived target/support worldlines backed by
  git-warp working sets
- requires `supportWorldlineIds`
- rejects `at`, `since`, and substrate working-set argument names
- accepts optional `readOnly`
- returns:
  - XYPH-first braid metadata in worldline terms
  - the updated worldline descriptor payload
  - a substrate backing block identifying the target/support working-set IDs

This slice intentionally establishes co-present composition without settlement.
It does **not** merge, rebase, collapse, or otherwise decide what should
happen to live truth.

## Derived Worldline Execution Slice

Canonical derived worldlines backed by git-warp working sets now support a
first honest execution slice:

- `braid_worldlines` updates the selected target worldline’s visible patch
  universe by pinning support-worldline overlays without mutating live truth
- `observe(graph.summary)`, `observe(worldline.summary)`, and
  `observe(entity.detail)` materialize isolated working-set-visible read
  graphs instead of silently reading `worldline:live`
- `history` reads the working set's pinned base plus overlay patch universe
- `diff` compares working-set-local coordinates rather than pretending the live
  frontier is the only truth
- `apply` lowers through the same mutation kernel as live writes, but commits to
  the working-set overlay patch log instead of the shared graph
- observation metadata for these commands uses the working set's visible
  frontier digest and explicit working-set / braid backing details
- braided `observe(conflicts)` adds an explicit warning when competing
  singleton property winners would self-erase co-presence under LWW

This is still intentionally partial. XYPH does **not** yet expose general
working-set-backed compatibility projections such as `briefing`, `context`,
`next`, `submissions`, `diagnostics`, or `prescriptions`, and it does **not**
yet expose collapse semantics in this slice. Broader compatibility-projection
parity remains future work, but the canonical derived-worldline execution slice
now keeps braid backing explicit across the commands listed above.

## Error Taxonomy

Stable machine-readable error codes:

- `invalid_envelope`
- `invalid_args`
- `unsupported_command`
- `not_implemented`
- `not_found`
- `unauthorized`
- `capability_denied`
- `policy_blocked`
- `invariant_violation`
- `stale_base_observation`
- `lease_expired`
- `attestation_missing`
- `collapse_not_allowed`
- `redacted`

`explain` is the companion command for turning these codes into structured
reasoning, basis, and remediation hints.

`redacted` may also appear inside successful read payloads as a per-field
redaction code when sealed observation preserves structure but withholds
restricted content.

## Idempotency

Durable-write commands accept `idempotencyKey` in `args`.

This applies to:

- `apply`
- `propose`
- `fork_worldline`
- `collapse_worldline`
- `comment`
- `attest`

In the current slice, `comment`, `propose`, and `attest` use the idempotency key
to derive deterministic durable IDs when the caller does not supply an explicit
ID.

## Sealed Observation

The current slice implements structured redaction for content-bearing
`entity.detail` reads whenever the effective capability resolves to a sealed
observation mode other than `full`.

Behavior:

- observation metadata is still returned
- structural entity shape is preserved
- protected bodies are omitted selectively
- `redactions` describes each withheld field with:
  - `path`
  - `code`
  - `reason`
  - optional `contentOid`

The current implementation redacts:

- `detail.content`
- `detail.questDetail.documents[*].body`
- `detail.questDetail.comments[*].body`

## Audit

Every terminal record carries audit metadata describing:

- principal
- principal type
- principal source
- observer profile
- policy pack version
- capability mode
- attempted time
- completed time
- outcome
- optional idempotency key

Invalid and denied requests must still produce auditable terminal records.
