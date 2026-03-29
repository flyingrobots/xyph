# Substrate Alignment

This note captures the desired boundary between git-warp and XYPH now that the
product loop, case model, and speculative-lane discussion have become clearer.

The short version is:

- git-warp should own worldlines, observer-relative reads, working sets,
  speculative ticking, transfer/collapse primitives, and substrate receipts
- XYPH should own policy, governance, cases, briefs, decisions, and the human
  + agent surfaces that govern when substrate moves are lawful

If XYPH keeps rebuilding those substrate concepts in application code, it will
quietly become a second graph system sitting on top of git-warp. That is not
the intended architecture.

## Desired Mental Model

The desired substrate model is:

- **WorldLine**: a causal lane of graph truth
- **Observer**: a read-only projection over a worldline plus access policy
- **Working Set**: a speculative copy-on-write lane pinned to a base
  observation
- **Intent**: a proposed rewrite against a working set or worldline
- **Tick**: deterministic admission of intents plus application of admitted
  rewrites
- **BTR / tick receipt**: the replayable hologram of what happened, what was
  admitted, and what was rejected as counterfactual
- **Transfer / collapse**: promotion of one speculative result into a target
  canonical worldline

In that model:

- plain reads never think about Git mechanics
- historical and observer-relative reads are substrate facts, not XYPH
  inventions
- speculative search across many candidate futures is substrate behavior
- XYPH decides whether a move is lawful, desirable, governed, or canonical for
  the product

## Current Reality

git-warp already provides several important pieces of that model:

- coordinate materialization via frontier plus optional Lamport ceiling
- seek/time-travel over historical coordinates
- observer views
- working sets as pinned base observation plus overlay identity
- braid composition for working sets
- working-set comparison and transfer planning
- visible state readers and projections over materialized state
- receipts, provenance, and deterministic reducer behavior

But the current runtime story is still lower-level than the desired model:

- a plain `WarpGraph` instance behaves like a mutable session handle with one
  active materialized state at a time
- `materialize()` changes that handle's active cached state; it does not mint a
  durable immutable worldline object
- observer views exist, but they are not yet the default read abstraction for
  higher-layer apps
- working sets already represent pinned base observation plus overlay, but
  intent queues and deterministic bundle admission are not yet the dominant
  public write model
- transfer planning exists, but the broader "promote this speculative lane into
  canonical truth" story is still more implicit than it should be

On the XYPH side, the main symptom is
[`GraphContext`](./../src/infrastructure/GraphContext.ts):

- it opens/materializes the graph
- queries many node families
- fetches neighbors broadly
- compiles an omnibus `GraphSnapshot`
- then hands that synthetic read model to many surfaces

That broad projection is application meaning mixed together with substrate
structure. It is useful in places, but it is too wide to be the default read
path.

## Responsibility Split

### git-warp should own

- worldline coordinates and coordinate-aware materialization
- observer-relative projections
- immutable or reader-backed historical inspection
- working sets as speculative lanes
- braid composition across speculative lanes
- intent admission and deterministic ticking
- counterfactual recording for rejected conflicting rewrites
- transfer/collapse primitives between worldlines or working sets
- receipts, provenance, and replayable substrate truth

### XYPH should own

- policy and lawful-action evaluation
- governance semantics
- cases, briefs, decisions, and decision receipts
- human and agent sponsor-actor surfaces
- product-facing queues, pages, and playbacks
- doctrine, hills, and operational meaning layered on substrate facts

The boundary is:

- git-warp owns **how** speculative graph truth is read, evolved, compared,
  and promoted
- XYPH owns **whether** that movement is lawful, governed, useful, and
  explainable for the product

## Gaps To Close

### 1. Observer-first reads are not yet the dominant API story

Today, higher layers can query and traverse the graph correctly, but the
default integration path still encourages "materialize, query many families,
and compile an app snapshot."

We want the primary read model to be:

- choose a worldline/coordinate
- choose an observer/access policy
- read through that projected handle

### 2. Working sets need to become the obvious speculative-worldline primitive

Working sets already store:

- pinned base frontier
- optional Lamport ceiling
- overlay identity
- optional braided overlays

That is almost exactly the right model. The missing part is to make
intent-driven ticking, counterfactual recording, and promotion/transfer feel
like first-class substrate behavior rather than higher-layer folklore.

### 3. XYPH must stop defaulting to omnibus graph reconstruction

XYPH should still derive meaning, but it should stop acting as if it needs to
reconstruct the graph into its own in-memory pseudo-database before it can do
useful work.

Landing-page aggregates may still justify broader projections. Most targeted
reads should not.

## Alignment Program

This is larger than one implementation slice. The alignment program should
proceed in stages.

### Stage 1: Observer / worldline read alignment

git-warp should expose a clean way to hold multiple independent read handles
over explicit coordinates or pinned working sets without treating one mutable
`WarpGraph` session as the only practical read abstraction.

The result should let XYPH replace at least one targeted read path without
using a giant `GraphSnapshot`.

### Stage 2: Working-set intent and tick model

git-warp should expose:

- intent queueing against a working set
- deterministic tick admission
- footprint overlap/conflict rejection
- counterfactual recording in the receipt/BTR

This should remain substrate-factual, not governance-rich.

### Stage 3: Transfer / collapse primitive

git-warp should provide the substrate move that promotes a selected speculative
lane into a target canonical worldline while preserving causal provenance and
receipt truth.

XYPH may still wrap that move in review, attestation, or settlement policy.

### Stage 4: XYPH refactor off the omnibus read model

As git-warp grows those primitives, XYPH should:

- narrow `GraphContext`
- replace broad app snapshots with observer/worldline-backed reads where
  possible
- keep only the product semantics and UI shaping that genuinely belong above
  the substrate

## Release Discipline

Because git-warp is used by more than XYPH, these changes should land as real
substrate releases, not local one-off hacks.

The expected flow is:

1. design the substrate slice in XYPH's corpus first
2. implement and test it in git-warp
3. publish a git-warp release
4. update XYPH to adopt that release
5. verify that one XYPH surface can now rely on the substrate instead of
   reconstructing it

This is slower than hacking around the gap in XYPH. That slowness is good. It
forces the substrate boundary to stay honest for every downstream app, not only
for this one.
