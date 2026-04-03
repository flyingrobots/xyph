# Effect Emission Alignment

This note defines the cross-repo contract for outbound effects, delivery
observations, replay-safe suppression, and debugger visibility.

It exists because XYPH now has a concrete need for:

- durable local diagnostic output
- replay-safe suppression of external side effects
- debugger-visible output provenance
- one honest story across XYPH, git-warp, and `warp-ttd`

The short version is:

- git-warp should own generic substrate facts for emitted effects and delivery
  observations
- `warp-ttd` should inspect those facts through explicit protocol envelopes
- XYPH should decide the domain meaning and policy of those effects

## Problem

Today, outbound behavior is fractured:

- XYPH has application-local logging and adapter calls
- replay/time-travel mode needs to avoid re-emitting dangerous outputs such as
  network traffic
- the debugger should be able to show what would have happened, what did
  happen, and what was deliberately suppressed

If XYPH invents a private output bus for this, it will create another layer of
substrate behavior above git-warp. That would violate the current doctrine:

- git-warp owns substrate facts
- XYPH owns meaning

## Core Doctrine

### 1. Outputs are not just logs

The system must not collapse these into one thing:

- semantic outbound effects
- adapter delivery attempts
- operational diagnostics

Those are distinct.

The important outbound primitive is not a log line. It is a durable effect
record.

### 2. Replay must stay honest

During replay or time-travel inspection:

- the system should still surface the effect that was emitted or would be
  emitted
- replay mode must be allowed to suppress external realization
- suppression must itself be visible as a substrate fact, not hidden adapter
  behavior

This lets the system be deterministic without accidentally re-sending live
traffic or mutating external systems during inspection.

### 3. Observer is not enough by itself

Observer remains a first-class concept, but observer alone should not govern
side-effect realization.

The substrate context for outbound behavior should be resolved from at least:

- principal
- observer profile
- worldline / coordinate
- execution or delivery lens
- policy or capability constraints

That keeps the observer/perception boundary honest. Observer shapes perception.
Delivery lens shapes how effects may or may not be externalized.

### 4. XYPH should not invent a second replay substrate

git-warp already owns:

- worldlines
- observer-relative reads
- receipts
- provenance
- replayable substrate truth

Outbound effect and delivery receipts should extend that substrate story rather
than being rebuilt in XYPH.

## Canonical Split

### git-warp owns

git-warp should own generic, host-agnostic substrate constructs for outbound
effect emission and delivery observation:

- effect emission records
- delivery observations
- replay-safe suppression facts
- execution / delivery lens metadata
- multiplexed sink / adapter fan-out at the substrate boundary
- durable append-only diagnostic/event streams where appropriate

These must remain generic substrate facts, not XYPH-specific ontology.

### warp-ttd owns

`warp-ttd` should expose and inspect those substrate facts as first-class
debugger payloads:

- emitted effect summaries
- delivery observation summaries
- active observer / aperture context
- active execution or delivery lens
- replay-vs-live suppression visibility

The debugger should not have to infer adapter behavior from missing side
effects. It should be able to inspect explicit receipts.

### XYPH owns

XYPH should own:

- which domain events imply outbound effects
- which effects are lawful or policy-bounded
- which effect families matter to the product
- how human and agent surfaces explain those effects
- which effects remain advisory, governable, or human-bound

XYPH should consume substrate effect receipts. It should not mint a private
parallel effect ontology unless a concept is genuinely product-specific.

## Substrate Model

The substrate should distinguish at least three layers.

### Effect emission

An effect emission says:

> the system produced an outbound effect candidate at this coordinate

Examples:

- diagnostic event
- UI notification
- export artifact
- network notification
- bridge or connector dispatch

### Delivery observation

A delivery observation says:

> adapter X delivered, suppressed, failed, or skipped that effect

Examples:

- delivered to local TUI log sink
- written to rotating chunk file
- suppressed because execution lens is replay
- failed because adapter transport was unavailable

### Diagnostic stream

Operational diagnostics should remain possible without turning every debug line
into graph-native ontology.

The clean model is:

- a generic substrate event stream can include diagnostic events
- durable chunk logging is a sink over that stream
- effect receipts are for semantically important outbound effects
- verbose debug noise does not need to become first-class product truth

## Replay / Time-Travel Rules

The replay-safe rule set should be:

1. replay still materializes effect emissions deterministically
2. external adapters may be replay-suppressed by delivery lens
3. suppression is observable and attributable
4. debugger clients can still inspect the effect and the suppression decision
5. live execution and replay execution must not be silently conflated

This means a replay session can truthfully say:

- this effect existed
- this adapter would normally deliver it
- it was suppressed in replay mode

instead of pretending the effect never existed.

## What git-warp needs to build

git-warp should add a substrate slice for outbound effect and delivery facts.

Minimum expected capability:

1. A generic emitted-effect record or receipt family.
2. A generic delivery-observation record or receipt family.
3. Explicit execution / delivery lens support that can distinguish live versus
   replay-safe delivery behavior.
4. Multiplexed sink fan-out so one effect stream can feed multiple external
   adapters.
5. Durable append-only chunk storage for local forensic streams, with rotation
   by byte budget and optionally line budget.
6. Receipt-level visibility so downstream debuggers can inspect the emitted
   effect and the delivery result.

Non-goals for git-warp:

- XYPH-specific governance semantics
- XYPH-specific queue names, suggestion semantics, or policy doctrine
- product-specific human/agent workflow meaning

## What warp-ttd needs to support

`warp-ttd` should extend its protocol and adapters so effect/delivery substrate
facts are inspectable instead of implicit.

Minimum expected capability:

1. Protocol support for effect-emission summaries.
2. Protocol support for delivery-observation summaries.
3. Playback/session visibility into observer/aperture plus execution or
   delivery lens.
4. Adapter capability declarations for reading those additional payloads.
5. TUI and CLI surfaces that can show:
   - what effect was emitted
   - what adapter handled it
   - whether it was delivered, suppressed, skipped, or failed
   - why replay-safe suppression occurred

Non-goals for `warp-ttd`:

- deciding whether an effect is lawful for XYPH
- inventing XYPH domain meaning above substrate receipts
- hiding delivery suppression behind host-specific heuristics

## What XYPH needs to support later

Once the substrate and debugger support exist, XYPH should:

1. Lower important outbound actions into substrate effect emission instead of
   private local adapter folklore.
2. Keep the current product meaning in XYPH:
   - why this effect exists
   - whether it is lawful
   - whether it is human-bound, advisory, or automatic
3. Project those effect receipts into human and agent surfaces where they help
   explain provenance and replay-safe behavior.
4. Avoid inventing a second private replay or delivery model in application
   code.

## Recommended Documentation Across Repos

This should be documented in all three repos.

### XYPH

XYPH should keep this note as the product/doctrine contract for the split:

- git-warp owns effect and delivery substrate facts
- `warp-ttd` inspects them
- XYPH interprets them

### git-warp

git-warp should add a design/plan note for:

- emitted-effect substrate receipts
- delivery-observation substrate receipts
- execution / delivery lens
- rotating chunk diagnostics as a sink, not as product meaning

### warp-ttd

`warp-ttd` should add a design note for:

- protocol additions for effect and delivery inspection
- adapter capability expectations
- replay-safe suppression visibility in CLI and TUI

## Rollout Order

The expected implementation order should be:

1. design the substrate slice in docs
2. implement it in git-warp
3. expose it in `warp-ttd`
4. adopt it in XYPH

That order preserves the substrate boundary and keeps replay/debug truth
consistent across the stack.
