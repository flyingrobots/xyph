# AUTHORITY MODEL
**Version:** 0.2.0
**Status:** FREEZE CANDIDATE

## Purpose

This document defines how XYPH separates perception, identity, and authority in
the sovereign control plane.

Load-bearing design direction:

> **XYPH uses one authority model for all principals.**

Load-bearing rule:

> **Observer profiles do not grant authority by existing.**

XYPH must not blur together:

- who is acting
- how reality is being observed
- what the actor is permitted to do

It must also avoid creating separate hidden permission systems for humans,
agents, services, or future institutional principals. The capability engine is
principal-general even when current policy or constitutional defaults reserve
some powers to human principals.

## Runtime Concepts

### Principal

The **principal** is the actor attempting an operation.

Examples:

- `human.ada`
- `agent.hal`
- future institutional or service principals

Principals are the source of authorship, accountability, and audit identity.
Authority is resolved over principals in general, not over a human-only role
system plus an agent special case.

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

The same capability-resolution machinery should apply to:

- human principals
- agent principals
- service principals
- future institutional principals

XYPH should not grow one authority engine for humans and a second, parallel
delegation story for agents.

## Default Reservation Posture

XYPH may still reserve some capabilities to human principals by default under
the active constitution or policy pack.

That should be understood as a **default reservation policy**, not as a
metaphysical split where humans use one authority model and non-humans use
another.

Examples of capability classes that may be human-reserved by default include:

- sovereign intent declaration
- approval-gate satisfaction
- workflow/profile activation
- emergency override
- high-risk replay or admin/debug powers

Those reservations must be:

- explicit
- inspectable
- attributable
- revocable when doctrine or policy changes

The long-term target is a principal-general authority system with bounded,
governed reservations where required, not a permanent blanket assumption that
all meaningful authority is human-only.

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
