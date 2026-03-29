# 0015: Doctor Audit Snapshot Profile

## Cycle Type

Debt-reduction / audit-read narrowing follow-on

This cycle follows `0014` by moving the doctor audit off the raw `full`
snapshot compatibility path.

## Graph Anchor

- Work item: `task:doctor-audit-snapshot-profile`

## Why This Cycle Exists

After `0014`, the remaining `full` consumers were the hardest ones:

- `doctor`
- control-plane `graph.summary`

`DoctorService` really does need a broad workflow and traceability view:

- campaigns
- quests
- intents
- scrolls
- approvals
- submissions
- reviews
- decisions
- stories
- requirements
- criteria
- evidence
- policies
- governed completion rollups

It also performs its own explicit family scans for:

- patchsets
- specs
- ADRs
- notes
- comments

What it does **not** need is the extra surface bundled into `full`, including:

- case nodes
- governance comparison artifacts
- collapse proposals
- attestations
- AI suggestion case-link assembly

This cycle introduces an explicit `audit` snapshot profile that preserves the
doctor’s real audit semantics without keeping it on the broadest available read
path.

## Sponsor Actors

### Primary sponsor actor

**Operator-Supervisor**

Needs graph-health audits to stay rich and truthful without silently paying for
unrelated governance and case-assembly work.

### Secondary sponsor actors

**Maintainer-Debugger**

Needs the doctor to remain a trustworthy structural audit surface while the
rest of XYPH keeps moving toward narrower graph reads.

## Outcome Hill

**As an operator running the doctor, I can audit workflow lineage,
traceability, and governed completion through an explicit audit snapshot
profile instead of the raw full snapshot compatibility surface.**

## Invariants

This cycle must preserve:

- The graph is the plan.
- git-warp owns substrate facts; XYPH owns meaning.
- Doctor still audits workflow lineage, traceability lineage, readiness gaps,
  sovereignty issues, and governed completion gaps.
- Doctor still computes governed completion from snapshot data.
- This slice narrows doctor reads; it does not redesign doctor semantics.

## Scope

In scope:

- add `profile: 'audit'` to `GraphContext`
- ensure the audit profile includes workflow, traceability, and completion data
- ensure the audit profile excludes cases and governance artifacts
- route `DoctorService` to `profile: 'audit'`
- pin the profile shape and routing with focused tests

Out of scope:

- control-plane summary narrowing
- doctor UX redesign
- narrative/comment/patchset family scans, which remain explicit doctor-owned
  queries

## Acceptance-Test Plan

### Checkpoint 1: Audit profile shape

1. `fetchSnapshot(..., { profile: 'audit' })` queries stories, requirements,
   criteria, evidence, policies, and suggestions
2. It does not query cases or governance artifact families
3. It preserves governed completion rollups for audited quests

### Checkpoint 2: Doctor routing

4. `DoctorService` requests `profile: 'audit'`

### Checkpoint 3: Overall regression safety

5. `npx tsc --noEmit` passes
6. focused graph-context + doctor unit coverage passes
7. `npm run lint` passes
8. the push hook suite stays green

## Implementation Notes

- Keep this profile-based rather than adding a doctor-only bespoke read helper.
- Leave doctor’s explicit patchset/narrative/comment scans alone in this slice.
- `audit` is intentionally narrower than `full` but richer than `analysis`.

## Playback Questions

1. Did doctor get an explicit honest profile instead of staying on raw `full`?
2. Did the slice stay bounded to doctor audit semantics instead of drifting
   into control-plane summary work?

## Exit Criteria

This cycle closes when:

- `GraphContext` supports `audit`
- `DoctorService` uses it
- focused tests pin both profile shape and service routing
- the retrospective records control-plane summary as the remaining `full`
  consumer
