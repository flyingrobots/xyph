# 0023: Observer-Native Read Architecture

## Cycle Type

Architecture reset

This cycle turns the current read-side bridge into an explicit redesign target
instead of letting it harden into the next accidental architecture.

## Status

Active implementation cycle.

The graph is healthy enough again to anchor the next slice honestly, and the
current bridge has done its job: `GraphContext` is gone. The first observer-
native seam cuts are now in code:

- normal product reads open explicit observation sessions
- CLI roots own observation/inspection adapter wiring
- `show` generic-entity reads bypass the omnibus detail path
- `DoctorService` uses an explicit inspection seam

The next step is not to rename the bridge again. The next step is to keep
shrinking it until the remaining projection layer is obviously transitional.

## Graph Anchor

- Work item: `task:git-warp-substrate-alignment`

This cycle is the XYPH-side companion to that broader substrate-alignment
spike. It is specifically about the XYPH read boundary, not about shipping the
entire git-warp substrate program in one slice.

## Why This Cycle Exists

The tactical pivot succeeded, but it also exposed the next architectural truth.

`GraphContext` is deleted, yet the current replacement still carries the same
shape in a thinner disguise:

- product surfaces now ask for a read session instead of constructing the old
  monolith directly
- `WarpObservationAdapter` still feeds a broad bridge projection for many
  surfaces
- it wraps that worldline in a fake graph facade
- then hands that facade to `ObservedGraphProjection`
- `ObservedGraphProjection` still acts like a broad omnibus projection engine
  and "single shared gateway" to graph-shaped truth

That bridge was useful because it let XYPH stop depending directly on
`GraphContext` without freezing the product. It should not become the final
design.

The real design target is:

- normal product reads flow through explicit worldline/observer-native sessions
- targeted surfaces use narrow projections that only shape the meaning they
  need
- doctor/provenance/control-plane inspection use a deeper explicit inspection
  seam instead of the same generic read port
- XYPH stops pretending it needs one app-owned pseudo-database before it can
  answer basic questions

## Sponsor Actors

### Primary sponsor actor

**Application Integrator**

Needs a read boundary that matches git-warp's actual model so higher-layer
surfaces stay thin and honest instead of rebuilding substrate behavior behind
ports with misleading names.

### Secondary sponsor actors

**Cold-Start Worker Agent**

Needs agent-native CLI and automation surfaces to read through explicit
worldline/observer sessions that can later grow into strand/speculative work
without another architectural reset.

**Operator-Supervisor**

Needs TUI and CLI surfaces to stay legible because they are reading the same
observed truth rather than fighting a hidden omnibus projection engine.

## Outcome Hill

**As an integrator building human and agent surfaces, I can rely on explicit
observer/worldline-native read sessions for normal XYPH reads, while deeper
doctor/provenance work goes through a separate inspection seam, so the product
stops rebuilding graph semantics behind a disguised compatibility adapter.**

## Invariants

This cycle must preserve:

- The graph is the plan.
- git-warp owns substrate facts; XYPH owns product meaning.
- Human and agent surfaces share one reality.
- Normal product reads must not default to a broad omnibus census when a
  targeted read would do.
- Observer/perception stays distinct from authority/capability.
- Doctor, provenance, and deep control-plane inspection remain explicit deeper
  paths, not ambient side effects of every normal read.
- The current bridge may survive temporarily during migration, but no new
  surface should deepen the bridge once the new contract exists.
- This cycle may break app-local contracts freely; backward compatibility is
  not the design goal.

## Scope

In scope:

- define the intended XYPH read-side contract family after `GraphContext`
- define what "normal observed read" means for TUI and agent surfaces
- define what belongs in a separate substrate inspection seam
- define how explicit worldline selection and observer selection enter normal
  read sessions
- define how targeted projections replace the omnibus `ObservedGraphProjection`
  over time
- identify the first surfaces that should migrate under the new contract
- write acceptance tests that pin the new boundary before deeper
  implementation

Out of scope:

- shipping the full git-warp worldline/observer API redesign
- implementing strand/speculative work surfaces in this slice
- reworking authority/capability semantics beyond what this cycle must name
- solving the remaining governed-completion graph debt
- polishing the current splash/progress behavior on top of the bridge

## Desired End-State

The intended shape is:

1. **Normal observed reads**
   - product surfaces open explicit read sessions
   - a read session is not assumed to be limited to a single worldline
   - each concrete view reads through a single observer
   - that observer acts on a chosen worldline and coordinate
   - the session exposes only the targeted read capabilities that surface
     needs

2. **Targeted projections**
   - dashboard, briefing, show/detail, and similar surfaces build narrow
     projections from that session
   - these projections are product-shaped, not substrate-manager-shaped

3. **Substrate inspection**
   - doctor, provenance, audit, and deeper control-plane inspection go through
     a separate seam that can legitimately ask bigger questions of the
     substrate

4. **Future advanced agent path**
   - worldline forks, Strands, speculative lanes, and deeper comparison work
     sit on a later explicit advanced path rather than leaking into normal
     reads
   - dashboards consist of views
   - each view uses a single observer
   - observers act on a worldline and coordinate
   - multiple views may observe the same worldline at different coordinates or
     with different observer properties
   - synchronized ticking across views is a product choice, not a hard
     architectural constraint
   - mutations flow through writers submitting intents rather than direct
     state edits

## Current Bridge To Replace

The bridge we should now treat as temporary is:

- [`WarpObservationAdapter`](../../src/infrastructure/adapters/WarpObservationAdapter.ts)
- [`WorldlineObservedProjectionAdapter`](../../src/infrastructure/adapters/WorldlineObservedProjectionAdapter.ts)
- [`ObservedGraphProjection`](../../src/infrastructure/ObservedGraphProjection.ts)

Its job was:

- get product surfaces off direct `GraphContext`
- keep the app working while the seam moved outward

Its limits are now explicit:

- many surfaces still collapse into `ObservedGraphProjection` after opening an
  explicit session
- the fake graph facade is still a substrate-shape compatibility trick
- the projection engine is still wider than the normal read path should be
- control-plane and dashboard bridges still materialize through the broad
  projection layer even though the surface seam is better

## Acceptance-Test Plan

### Checkpoint 1: Explicit observed sessions

1. A normal product read opens an explicit observed session rather than
   hard-coding a live-worldline adapter internally.
2. The observed-session contract names both worldline selection and observer
   context as inputs to the read model.
3. The normal observed session exposes targeted read capabilities only; it does
   not smuggle raw graph/session control upward.
4. Dashboard views are modeled as `view -> observer -> worldline + coordinate`
   rather than as one shared omnibus snapshot plus local filtering.

### Checkpoint 2: Targeted product reads

5. One user-facing targeted read path no longer depends on the omnibus
   `ObservedGraphProjection` pipeline.
6. Entity detail and other narrow reads do not require a whole-snapshot census
   when the surface only needs targeted detail.
7. Dashboard, briefing, and show/detail reads stay aligned on one observed
   truth model even when they use different purpose-built projections.

### Checkpoint 3: Inspection split

8. Doctor/provenance/control-plane inspection no longer piggyback on the same
   normal observed-read seam as everyday product reads.
9. The inspection seam is explicit enough that future replay/provenance work
   can deepen there without bloating the normal session contract.

### Checkpoint 4: Regression safety

10. Focused tests pin the new session contract and the first migrated surfaces.
11. `npx tsc --noEmit` passes after the first implementation slice.
12. The retrospective records what still remains of the bridge and what needs
    a future git-warp release rather than another XYPH-local workaround.

## Current Progress

Implemented in this cycle so far:

- explicit `ObservationPort` / `ObservationSession` request contract with
  `source`, optional `observer`, and `purpose`
- explicit `SubstrateInspectionPort` for doctor-style deeper reads
- CLI root-owned observation, operational-read, and inspection adapters
- generic `show` reads now use a targeted entity-detail reader over the
  observation session instead of always going through omnibus projected detail
- briefing AI suggestion queue/candidate reads now use a targeted observed-
  session reader instead of pulling AI suggestions from the omnibus snapshot
- submission/review assembly now has a dedicated observed-session reader, and
  agent-facing submission list, briefing review/submission queues, action
  validation semantics, and submission-context inspection all use that reader
  instead of deriving those flows from the omnibus projected snapshot
- the dashboard `Review` page now has a dedicated observer-backed read path:
  the dashboard read seam owns a review-page fetch, the adapter opens a named
  review observer, and the TUI renders review context from targeted
  review-page data instead of mining reviews/decisions from the broad
  operational snapshot
- the dashboard read seam is now explicitly view-keyed: landing snapshot reads
  and quest/review/governance/suggestion/case page reads route through named
  dashboard observers instead of a single generic `dashboard.detail` lens
- the landing cockpit now has its first targeted aggregate slice: the `Review`
  lane reads through its own `dashboard.view.landing.review` observer and
  targeted review-lane data instead of relying only on the omnibus landing
  snapshot for submission queue state
- the landing cockpit `Suggestions` lane now has the same treatment: it reads
  through its own `dashboard.view.landing.suggestions` observer and targeted
  suggestion-lane data instead of relying only on the omnibus landing snapshot
  for AI suggestion queue state
- the landing cockpit `Now` lane now has the same observer-backed aggregate
  seam: it reads through `dashboard.view.landing.now` and targeted now-lane
  data for queue/activity semantics instead of deriving those views from the
  omnibus landing snapshot
- agent/service call sites now take explicit observation ports instead of
  quietly instantiating their own observation adapters
- acceptance spec updated from placeholder failures to real seam assertions

Still intentionally transitional:

- `WarpObservationAdapter` still lowers many reads through
  `ObservedGraphProjection`
- dashboard and broader operational snapshots still depend on the omnibus
  projection bridge
- deeper control-plane substrate work still mixes old and new patterns
- the landing shell still boots from a broad operational snapshot for
  cross-lane/meta state, even though the `Now`, `Review`, and `Suggestions`
  lanes now read through targeted per-lane observers; the shell-level landing
  snapshot remains the broadest remaining bridge consumer

## Implementation Notes

- Treat the current adapter stack as a compatibility bridge, not as the final
  architecture.
- Prefer explicit read-session descriptors over more helper methods on a broad
  adapter.
- Keep product-shaped projections close to the surfaces that use them.
- Do not invent a second app-local graph abstraction to replace the old one
  under a different name.
- Keep normal read and substrate inspection contracts separate even if they
  share some infrastructure initially.
- If git-warp API pressure emerges, write it down explicitly instead of hiding
  it behind more XYPH glue.

## Playback Questions

1. Did this cycle make the read boundary easier to explain in terms of
   worldlines, observers, and product meaning?
2. Can a human-facing surface and an agent-facing surface now be described as
   different projections over the same observed truth rather than different
   consumers of a giant app snapshot?
3. Did we create a real inspection seam instead of another hidden compatibility
   layer?
4. Is the remaining bridge narrower and more obviously temporary than when the
   cycle started?

## Exit Criteria

This cycle closes when:

- the intended normal-read vs inspection-seam split is explicit in code and
  docs
- at least one meaningful targeted read path no longer routes through the
  omnibus projection bridge
- the acceptance tests capture the new boundary honestly
- the retrospective names what still depends on future git-warp substrate work
  instead of pretending the architectural reset is complete
