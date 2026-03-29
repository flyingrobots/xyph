# 0019: Dashboard All Semantics

## Cycle Type

Design / dashboard-semantics slice before implementation

This cycle follows `0018` by fully designing the last remaining deliberate raw
`full` dashboard view:

- `status --view all`

## Graph Anchor

- Work item: `task:dashboard-all-semantics`

## Why This Cycle Exists

After `0018`, the dashboard now routes:

- `trace` -> `audit`
- `suggestions` -> `analysis`
- most workflow views -> `operational`

That leaves `all` as the last obvious broad dashboard consumer.

But `all` is not merely “still broad.” It is currently **semantically split**:

### 1. TUI `all` is not actually all

[`renderAll()`](/Users/james/git/xyph/src/tui/render-status.ts) currently
renders only:

- campaigns
- intents
- quests
- scrolls
- approvals

Yet it labels itself “All XYPH Nodes” and computes a total that also counts:

- submissions
- reviews
- decisions
- stories
- requirements
- criteria
- evidence
- policies
- suggestions

So the current human-facing `all` view overclaims what it shows.

### 2. JSON `all` is a raw snapshot dump

[`dashboard.ts`](/Users/james/git/xyph/src/cli/commands/dashboard.ts) currently
returns:

```ts
data: { ...snapshot, view, health }
```

for JSON `all`.

That means:

- TUI `all` is a partial workflow census
- JSON `all` is an effectively unbounded snapshot transport

Those are not the same product surface.

## Sponsor Actors

### Primary sponsor actor

**Operator-Supervisor**

Needs one broad dashboard view that orients them on live workflow truth without
quietly becoming a raw transport dump.

### Secondary sponsor actor

**Cold-Start Worker Agent**

Needs a predictable, bounded “show me the whole workflow surface” view, not a
mode-dependent semantic trap.

### Tertiary sponsor actor

**Maintainer-Debugger**

Sometimes wants a raw export, but that need should be explicit and separate
from the operator-facing dashboard semantics.

## Outcome Hill

**As an operator or agent using `status --view all`, I get one coherent
workflow census across TUI and JSON instead of a partial human view plus a raw
snapshot dump.**

## Invariants

This cycle must preserve:

- The graph is the plan.
- dashboard views stay product-facing, not debug-dump-facing
- if raw snapshot export remains necessary, it should be explicit
- `all` should not silently reintroduce broad snapshot semantics after the
  previous narrowing work

## Current Findings

### 1. `all` is not a good name for a raw snapshot dump

Users reasonably read `all` as “show me the whole operator surface,” not
“serialize the current internal snapshot assembly shape.”

### 2. The human and JSON modes currently disagree about what `all` means

That drift is worse than mere over-fetch. It makes the command mode-dependent
in a way the name does not communicate.

### 3. The rendered TUI surface is really a workflow census

The sections already shown are workflow-facing. The missing obvious workflow
families are:

- submissions
- reviews
- decisions

Those fit the same operator story.

Traceability and suggestion surfaces already have dedicated views, so `all`
does not need to inherit them.

## Design Options

### Option A: Keep `all` on raw `full` and make the TUI literally show everything

#### Strengths

- superficially aligns the name with the implementation

#### Weaknesses

- turns the dashboard into a huge mixed-sponsor dump
- duplicates dedicated `trace` and `suggestions` views
- keeps the last raw `full` dashboard dependency alive
- still leaves JSON as an unbounded transport blob

#### Verdict

Rejected.

This is mechanically easy and product-wise wrong.

### Option B: Redefine `all` as a workflow census

Make `all` mean:

- the broadest operator-facing workflow view
- campaigns
- intents
- quests
- scrolls
- approvals
- submissions
- reviews
- decisions

Route it through `operational`, not `full`.

Keep JSON and TUI aligned on that same meaning.

#### Strengths

- matches what operators actually need
- removes the last obvious raw `full` dashboard dependency
- keeps specialized views specialized
- gives JSON a bounded, deliberate product shape

#### Weaknesses

- changes the JSON `all` payload shape
- may require a separate explicit export/debug surface later

#### Verdict

Accepted.

This is the correct product semantics.

### Option C: Remove `all`

#### Strengths

- removes ambiguity entirely

#### Weaknesses

- throws away a useful operator overview surface
- creates unnecessary churn when a clearer meaning is enough

#### Verdict

Rejected for now.

## Decision

`status --view all` should be treated as a **workflow census**, not a raw
snapshot dump.

That means the next implementation slice should:

1. route `all` through `profile: 'operational'`
2. make TUI and JSON agree on the same workflow-census semantics
3. expand the rendered/returned workflow families to include:
   - submissions
   - reviews
   - decisions
4. stop using JSON `all` as `{ ...snapshot }`

## Payload Semantics

For the next implementation slice, `all` should expose:

- `view`
- `health`
- `campaigns`
- `intents`
- `quests`
- `scrolls`
- `approvals`
- `submissions`
- `reviews`
- `decisions`

It should not implicitly include:

- stories
- requirements
- criteria
- evidence
- policies
- suggestions
- aiSuggestions
- governance artifacts
- cases

Those belong to other dedicated views or future explicit export/debug surfaces.

## Acceptance-Test Plan For The Next Slice

### Checkpoint 1: Routing

1. `status --view all` requests `profile: 'operational'`

### Checkpoint 2: Semantic alignment

2. TUI `all` renders the full workflow census, including submission/review/
   decision sections
3. JSON `all` returns a bounded workflow-census payload instead of
   `{ ...snapshot }`

### Checkpoint 3: Regression safety

4. focused dashboard command and render tests pass
5. `npx tsc --noEmit` passes
6. `npm run lint` passes
7. the push firewall stays green

## Playback Questions

1. Does `all` now mean one thing in both TUI and JSON?
2. Did we retire the last raw `full` dashboard dependency?
3. If raw snapshot export is still needed, is that need now explicit rather
   than hidden behind `all`?

## Exit Criteria

This cycle closes when the design is explicit, product-facing, and ready for a
bounded implementation slice rather than more ambiguous dashboard drift.
