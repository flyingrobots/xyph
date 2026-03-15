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
- implemented now: `apply`
- implemented now: `propose`
- implemented now: `comment`
- implemented now: `attest`
- reserved, not yet implemented: `fork_worldline`
- reserved, not yet implemented: `compare_worldlines`
- reserved, not yet implemented: `collapse_worldline`
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
- `graphMeta`
- optional `comparisonPolicyVersion`

Every read accepts:

- `at`
- optional `since`

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
