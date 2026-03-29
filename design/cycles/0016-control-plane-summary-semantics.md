# 0016: Control-Plane Summary Semantics

## Cycle Type

Design / protocol-semantics slice before implementation

This cycle follows `0015` by fully designing the last remaining raw `full`
consumer:

- control-plane `graph.summary`
- control-plane `worldline.summary`

## Graph Anchor

- Work item: `task:control-plane-summary-semantics`

## Why This Cycle Exists

After `0015`, the last obvious raw `full` consumer is the control-plane summary
projection in [`/Users/james/git/xyph/src/domain/services/ControlPlaneService.ts`](../../src/domain/services/ControlPlaneService.ts).

Today that projection returns only:

- `projection`
- `at`
- `asOf`
- `counts`
- `graphMeta`

But it gets those counts by paying for the broadest read path available:

- full snapshot family queries
- neighbor loading
- model assembly
- traceability completion rollups
- suggestion parsing

That is structurally wrong. The summary projection is not a dashboard snapshot,
quest detail, doctor audit, or traceability analysis surface. It is a thin
orientation record.

So the design question is not merely:

- “which snapshot profile should summary use?”

The real question is:

- “should summary be a snapshot profile at all?”

This cycle settles that question before implementation.

## Current Observations

### 1. The current payload is thin

The current summary response only exposes counts plus graph metadata. It does
not expose snapshot arrays or derived product models.

### 2. The current implementation is too broad

The current implementation routes both `graph.summary` and `worldline.summary`
through `graphCtx.fetchSnapshot()`, which is the broad compatibility surface we
have been shrinking in every recent cycle.

### 3. The current semantics are already inconsistent

The current summary counts include:

- campaigns
- quests
- intents
- scrolls
- submissions
- reviews
- decisions
- stories
- requirements
- criteria
- evidence
- policies
- suggestions

But notably omit:

- approvals

That is a clue that the projection has never had a sharply designed sponsor
purpose. It is currently “whatever the snapshot already had,” not a deliberate
protocol surface.

### 4. The current tests do not require the broad snapshot

The important tests around summary care about:

- observation metadata
- derived-worldline parity
- correct quest counts before and after worldline operations

They do **not** currently require traceability-model assembly, completion
rollups, or other heavy snapshot semantics.

## Sponsor Actors

### Primary sponsor actor

**Operator-Supervisor**

Needs a fast, trustworthy answer to:

- what worldline am I looking at?
- how much live work is visible here?
- is this lane materially different from live truth?

### Secondary sponsor actors

**Cold-Start Worker Agent**

Needs a cheap orientation surface that can answer:

- how much work exists here?
- is this a live graph or a derived worldline?
- is this lane sparse, active, or empty?

### Tertiary sponsor actor

**Governance Reviewer**

Needs worldline summary to remain parity-honest when reviewing derived lanes,
but does not need a full doctor-grade audit every time they ask for a summary.

## Outcome Hill

**As an operator or agent requesting `graph.summary` or `worldline.summary`, I
get a cheap, parity-honest orientation record that reflects visible workflow
truth without paying for unrelated snapshot assembly.**

## Invariants

This cycle must preserve:

- The graph is the plan.
- git-warp owns substrate facts; XYPH owns product meaning.
- derived-worldline summaries must remain parity-honest with the selected lane
- summary remains a protocol-safe projection, not an ad hoc debug blob
- doctor and entity detail remain the richer surfaces for audit and diagnosis

## Design Options

### Option A: Keep summary on a new snapshot profile

Create another `GraphSnapshotProfile` such as `summary` and keep
`graph.summary` / `worldline.summary` on `fetchSnapshot()`.

#### Strengths

- small implementation delta
- reuses existing `GraphContext`

#### Weaknesses

- still forces summary through snapshot semantics it does not need
- encourages more profile proliferation inside `GraphContext`
- keeps the conceptual lie that “summary is just a kind of snapshot”

#### Verdict

Rejected.

This is mechanically easy but architecturally wrong.

### Option B: Reuse `operational` or `audit`

Route summary through an existing narrower profile.

#### Strengths

- minimal code churn

#### Weaknesses

- `operational` is shaped for dashboard/workflow surfaces, not protocol
  orientation
- `audit` is shaped for doctor semantics, not quick summary
- both still over-fetch for a counts-only projection

#### Verdict

Rejected.

Summary should not inherit the semantics of dashboard or doctor.

### Option C: Make summary its own direct read path

Stop routing summary through `GraphSnapshot` entirely. Build a dedicated
summary reader that:

- reads `graphMeta`
- reads family counts directly from the graph/worldline handle
- returns a thin summary record without model assembly

#### Strengths

- matches the actual payload shape
- keeps summary cheap and honest
- avoids more `GraphSnapshot` profile sprawl
- preserves derived-worldline parity because the count reader still runs
  against the selected graph handle

#### Weaknesses

- requires a dedicated implementation path
- may need a thin helper outside `GraphContext`

#### Verdict

Accepted.

This is the correct semantic design.

## Decision

`graph.summary` and `worldline.summary` should be treated as **orientation
projections**, not snapshot projections.

The implementation direction for `0016` should be:

1. Stop routing summary through `graphCtx.fetchSnapshot()`.
2. Introduce a dedicated summary read helper over the selected graph handle.
3. Use direct family-count queries, ideally via git-warp query aggregation
   (`aggregate({ count: true })`), instead of materializing arrays and models.
4. Preserve derived-worldline parity by running the helper against the same
   live or isolated graph handle already selected by control-plane observe.

## Payload Semantics

For the next implementation slice, summary should remain intentionally thin:

- `projection`
- `at`
- `asOf`
- `counts`
- `graphMeta`

The counts should be interpreted as **orientation counts**, not doctor-grade
audit findings.

### Required orientation counts

These are the workflow counts that matter most to the sponsor actors:

- campaigns
- quests
- intents
- approvals
- scrolls
- submissions
- reviews
- decisions
- suggestions

### Optional compatibility counts

The current v1 response shape also exposes:

- stories
- requirements
- criteria
- evidence
- policies

For the implementation slice, keep those fields for wire compatibility if that
avoids churn, but compute them through direct count queries rather than through
full snapshot assembly.

Longer-term, if sponsor actors do not actually need them in summary, they
should move behind a separate audit-oriented projection rather than staying in
the orientation payload forever.

## Recommendation For The Implementation Slice

### Phase 1: Honest implementation without wire churn

Implement `graph.summary` / `worldline.summary` as a direct summary reader that:

- uses the selected graph/worldline handle
- reads `graphMeta`
- counts the node families currently present in the summary payload
- adds `approvals` to the workflow census
- avoids `GraphContext.fetchSnapshot()` entirely

This gives us the architectural win now without forcing a protocol redesign in
the same slice.

### Phase 2: Protocol cleanup if sponsor need justifies it

After the direct count reader lands, decide whether:

- traceability-family counts still belong in summary
- summary should split into `workflowCounts` and `traceabilityCounts`
- a separate audit-oriented summary projection is warranted

Do not mix that wire-shape decision into the first implementation slice unless
testing proves it is low-risk.

## Scope

In scope for the next implementation slice:

- direct summary read helper design
- explicit sponsor semantics for summary
- preserving derived-worldline parity
- removing summary from the raw full snapshot path

Out of scope for the next implementation slice:

- redesigning doctor or entity-detail semantics
- redefining the entire control-plane wire protocol
- broad CLI/UI changes downstream of summary

## Acceptance-Test Plan

### Checkpoint 1: Semantic boundary

1. `graph.summary` and `worldline.summary` no longer call
   `fetchSnapshot()`
2. they still return parity-honest counts for live and derived worldlines
3. they still return `graphMeta` and observation metadata

### Checkpoint 2: Protocol stability

4. existing summary tests stay green with minimal or no payload churn
5. if `approvals` is added, tests pin it intentionally

### Checkpoint 3: Architectural honesty

6. summary no longer depends on completion rollups, neighbor loading, or other
   snapshot assembly behavior
7. `GraphContext` does not gain yet another profile just to serve summary

## Playback Questions

1. Did we design summary around operator/agent orientation rather than around
   snapshot convenience?
2. Did we choose a path that preserves derived-worldline parity without keeping
   summary on the broad full snapshot surface?
3. Did we resist turning `GraphContext` into an ever-growing profile bucket?

## Exit Criteria

This design slice closes when:

- the semantic role of summary is explicit
- the implementation direction is settled
- the next coding slice can proceed without re-litigating what summary is for
