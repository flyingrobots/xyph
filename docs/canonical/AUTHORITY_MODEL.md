# AUTHORITY MODEL
**Version:** 0.1.0
**Status:** FREEZE CANDIDATE

## Purpose

This document defines how XYPH separates perception, identity, and authority in
the sovereign control plane.

Load-bearing rule:

> **Observer profiles do not grant authority by existing.**

XYPH must not blur together:

- who is acting
- how reality is being observed
- what the actor is permitted to do

## Runtime Concepts

### Principal

The **principal** is the actor attempting an operation.

Examples:

- `human.ada`
- `agent.hal`
- future institutional or service principals

Principals are the source of authorship, accountability, and audit identity.

### Observer Profile

The **observer profile** shapes how graph reality is projected. It is a
perception configuration, not a permission grant.

Observer profile fields may include:

- `observerProfileId`
- `basis`
- `basisVersion`
- `aperture`
- `apertureVersion`
- `diagnosticScope`
- `comparisonPolicyDefaults`

Observer profiles may change:

- how much content is visible
- which diagnostics are in scope
- how comparison defaults are resolved
- how sealed observations are redacted

Observer profiles must not directly encode runtime mutation permissions such as
`allowedCommands`.

### Effective Capability Grant

The **effective capability grant** is the computed answer to:

> What may this principal do, using this observer, at this coordinate, under
> this policy pack, with these rights constraints?

Capability resolution is computed from:

- principal identity
- observer profile
- observation/worldline coordinate
- policy pack
- rights constraints
- constitutional gates
- local invariants and structural blockers

The same observer profile may yield different effective powers under different
principals, policy packs, or coordinates.

## Observer Profiles and Authority

Observer profiles are intentionally non-operative by themselves.

They may influence:

- projection shape
- redaction behavior
- comparison defaults
- explanatory context

They do not authorize:

- mutations
- attestations
- collapse execution
- replay override
- admin/debug commands

Those decisions belong to capability resolution.

## Rights and Replay Governance

XYPH treats replay and high-aperture observation as governed capabilities, not
as generic admin powers.

The runtime model must explicitly reason about:

- replay capability tiers
- consent and revocation
- sealed observation modes
- descendant accountability for forks
- due-process override for exceptional access
- abuse risks such as coercive introspection or extraction

## Tyranny Diagnostic

`tyranny` is not a role class. It is a diagnostic emitted when authority or
aperture concentrates unsafely.

The diagnostic should consider dangerous concentration of:

- planning authority
- execution authority
- adjudication authority
- emergency authority
- replay authority

## Current Slice

The current sovereign-control-plane foundation carries observer and policy
metadata in its JSONL observation coordinate and durable proposal/attestation
records. It now also computes a bootstrap per-request effective capability grant
for `xyph api`, including:

- runtime-default vs request-auth principal source
- observer-profile-derived perception context
- explicit admin-mode requests for hidden admin/debug commands
- current-slice command gating for `apply`, `attest`, `propose`, `comment`,
  `query`, and `rewind_worldline`

This is still a bootstrap authority engine, not the final rights model. It does
**not** yet implement full worldline-specific observer governance, replay
consent, due-process override flows, or sealed-observation policy packs. This
document defines the target contract that future slices must satisfy.
