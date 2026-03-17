# ARTIFACT + MUTATION SEMANTICS
**Version:** 0.1.0
**Status:** FREEZE CANDIDATE

## Purpose

This document defines the canonical artifact taxonomy and mutation semantics for
the sovereign control plane.

## Canonical Artifact Taxonomy

The public control-plane taxonomy recognizes these canonical artifact kinds:

- **observation record**
- **comparison artifact**
- **collapse proposal**
- **conflict artifact**
- **attestation record**
- **audit record**

Comments are durable append-only records, but they are not decision artifacts.

## Durable Record Semantics

Default durable-record rules:

- comments are append-only
- comments are immutable after write
- comments may point to a newer record via supersession metadata
- attestations are append-only
- attestations are immutable after write
- proposals are non-authoritative durable records
- old durable records are not edited in place or deleted during normal runtime

## Proposal Semantics

Proposals express candidate transforms without making them true.

Examples:

- dependency proposal
- packet proposal
- doctor-fix proposal
- collapse proposal

Acceptance of a proposal must lower through canonical mutation paths such as
`apply` or `collapse_worldline`. A proposal does not become truth by existing.

## Attestation Semantics

Attestations record explicit decisions such as:

- approve
- reject
- certify
- endorse
- waive
- escalate

Every attestation should carry:

- principal
- observer profile
- policy pack version
- target artifact
- decision type
- rationale
- scope
- timestamp
- audit/provenance linkage

## Mutation Kernel

`apply` is the canonical mutation path.

Allowlisted primitive ops:

- `add_node`
- `remove_node`
- `set_node_property`
- `add_edge`
- `remove_edge`
- `set_edge_property`
- `attach_node_content`
- `attach_edge_content`

The mutation kernel validates primitive graph invariants before commit and is
the only sanctioned foundation for sovereign control-plane writes.

## Collapse Lowering

`collapse_worldline` must not become a second mutation engine.

When implemented, `collapse_worldline` must lower to a validated mutation plan
through the same:

- mutation validator
- capability-resolution path
- audit path
- idempotency model

used by `apply`.

## Lease Semantics

Derived worldlines may carry lease metadata.

Default lease behavior:

- lease expiry places the worldline into read-only hold
- further mutation is blocked with `lease_expired`
- reads continue to work
- renewal is required before further writes
- expiry may surface diagnostics, but it does not auto-abandon the worldline by
  default

## Sealed Observation Semantics

Sealed observation is structured redaction, not vague secrecy language.

Default behavior:

- preserve observation shape and metadata
- redact protected content bodies selectively
- return machine-readable redaction reasons and codes
- avoid failing the whole observation when partial redaction is sufficient

Current implemented redaction targets:

- `entity.detail.content`
- `entity.detail.questDetail.documents[*].body`
- `entity.detail.questDetail.comments[*].body`

Redaction metadata is returned alongside the successful observation payload so
clients can distinguish withheld content from absent content.

## Current Slice

The current sovereign-control-plane foundation implements:

- append-only comments
- append-only attestations
- non-authoritative proposals
- primitive-op `apply`
- working-set-backed `fork_worldline` creation from `worldline:live`
- tick-aware low-level observation for `graph.summary`, `worldline.summary`,
  `entity.detail`, `history`, and `diff`
- tip-scoped `observe(conflicts)` backed by git-warp conflict analysis for the
  live frontier or a derived worldline's backing working set
- derived-worldline `observe(graph.summary)`, `observe(worldline.summary)`,
  `observe(entity.detail)`, `history`, `diff`, and `apply` routed through
  git-warp working sets rather than the shared live graph
- structured redaction for content-bearing `entity.detail` observations

Current `fork_worldline` is intentionally narrow:

- it creates a derived worldline descriptor backed by a git-warp working set
- it may carry owner, scope, and lease metadata
- `at: <tick>` currently lowers to a current-frontier Lamport ceiling
- it now provides working-set-backed `observe(graph.summary)`,
  `observe(worldline.summary)`, `observe(entity.detail)`, `history`, `diff`,
  `apply`, and `observe(conflicts)` for canonical derived worldlines
- it does **not** yet provide broader compatibility projections or nested
  derived-worldline forking

It does **not** yet implement full comparison artifacts, collapse proposals as
first-class executable workflows, full worldline-local execution, or lease
enforcement. Those remain future slices governed by this contract.
