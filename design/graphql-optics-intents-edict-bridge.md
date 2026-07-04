# GraphQL Optics, Intent Declarations, and the Edict Bridge

## Status

Hot design topic. Proposed boundary doctrine for the substrate decoupling program.

This note locks in the decision that XYPH may use GraphQL as an authoring and
contract language for domain optics and domain intents, but must not use GraphQL
as a generic WARP graph query API.

## Problem

XYPH is drifting into bedrock-shaped application code.

The red flags are familiar:

- application and domain services import `GraphPort`
- CLI and TUI paths call `graph.patch`
- product reads call `getNodeProps`, `neighbors`, `getEdges`, or `query`
- content reads inspect `_content`
- app-facing types say `Graph`, `Node`, `Edge`, `worldline`, or `materialize`

Those calls may compile, but they preserve the wrong architecture. XYPH should
not imperatively manage graph traversal, node properties, materialized state,
content addressing, or WARP worldline handles. git-warp owns that substrate.

XYPH owns meaning:

- optics
- intents
- governance
- policy
- lawful action
- sponsor-actor surfaces
- evidence and settlement semantics

Edict will eventually become the operational law engine for those meanings. XYPH
should not wait for Edict to be fully online before correcting the boundary.

## Decision

XYPH should define domain optics and domain intents as GraphQL operations plus
XYPH lawpacks.

Wesley compiles those declarations into canonical optic or intent IR. Today,
that IR lowers into local XYPH ports and git-warp-backed infrastructure
adapters. Later, the same declaration layer can lower into Edict without
changing product-facing code.

The GraphQL schema is a domain API. It is not a substrate API.

## App-Level API Names

The app-level API uses boring, universal names:

- `XYPHReader`
- `XYPHWriter`
- `*Reading` declarations for reads
- named write declarations for writes, such as `RecordComment`

`Optic` remains the declaration/compiler word. Application code should prefer
`Reading`.

Canonical call shape:

```ts
await reader.read(QuestDetailReading({ questId }));

await writer.write(RecordComment({
  targetId,
  message,
  authoredBy,
}));
```

`Reader` and `Writer` are application capabilities. `QuestDetailReading` and
`RecordComment` are the domain declarations they consume. Product code should
not ask for topology, raw state, patches, WARP handles, or primitive mutation
operations.

## Core Boundary

Allowed:

```graphql
query QuestDetail($id: QuestId!) {
  questDetail(id: $id) {
    id
    title
    readiness {
      status
      blockers
    }
    intent {
      id
      title
    }
    criteria {
      id
      status
      evidenceCount
    }
  }
}
```

Forbidden:

```graphql
query RawNode($id: ID!) {
  node(id: $id) {
    props
    outgoingEdges {
      label
      to
    }
  }
}
```

The second shape only hides `getNodeProps` and `neighbors` behind GraphQL. That
is not an optic. It is substrate leakage with a schema.

Allowed:

```graphql
mutation PromoteQuest($input: PromoteQuestInput!) {
  promoteQuest(input: $input) {
    quest {
      id
      status
      intent {
        id
      }
    }
    witness {
      id
      admittedAt
    }
  }
}
```

Forbidden:

```graphql
mutation PatchGraph($ops: [PatchOp!]!) {
  patchGraph(ops: $ops) {
    patch
  }
}
```

The mutation must describe domain intent. It must not expose graph patching as a
product operation.

## Target Architecture

```text
XYPH CLI / TUI / agent protocol
  |
  | GraphQL operation documents
  v
Wesley compiler
  |
  | XYPH schema + XYPH lawpacks
  v
Optic IR / Intent IR
  |
  | generated TypeScript contracts
  v
XYPH application ports
  |
  | temporary implementation boundary
  v
git-warp adapters today
Edict runtime later
```

The application layer imports generated domain contracts. It does not import
git-warp handles.

Example application call:

```ts
await optics.questDetail({ id: questId });
await intents.promoteQuest({ questId, intentId, campaignId, actor });
```

Forbidden application call:

```ts
const graph = await graphPort.getGraph();
const props = await graph.worldline().getNodeProps(questId);
await graph.patch((p) => p.setProperty(questId, 'status', 'READY'));
```

## Lawpack Shape

XYPH lawpacks annotate the domain schema with admission and read posture. The
exact directive vocabulary can evolve, but the first lawpack should distinguish
read optics from mutating intents and make authority, footprint, and witness
requirements explicit.

Candidate directives:

```graphql
directive @optic(
  view: String!
  consistency: ConsistencyMode!
) on FIELD_DEFINITION

directive @intent(
  kind: String!
  authority: Authority!
  idempotentBy: [String!]!
) on FIELD_DEFINITION

directive @requiresHumanAuthority on FIELD_DEFINITION
directive @requiresIntentLineage on FIELD_DEFINITION
directive @reads(types: [String!]!) on FIELD_DEFINITION
directive @writes(types: [String!]!) on FIELD_DEFINITION
directive @emitsWitness(kind: String!) on FIELD_DEFINITION
```

Example optic:

```graphql
type Query {
  reviewPage(submissionId: SubmissionId!, questId: QuestId!): ReviewPage
    @optic(view: "dashboard.view.review", consistency: OBSERVED)
    @reads(types: ["Quest", "Submission", "Patchset", "Review", "Decision", "Artifact"])
}
```

Example intent:

```graphql
type Mutation {
  promoteQuest(input: PromoteQuestInput!): PromoteQuestPayload!
    @intent(kind: "xyph.quest.promote", authority: HUMAN, idempotentBy: ["input.questId", "input.intentId"])
    @requiresHumanAuthority
    @requiresIntentLineage
    @reads(types: ["Quest", "Intent", "Campaign"])
    @writes(types: ["Quest"])
    @emitsWitness(kind: "QuestPromoted")
}
```

Wesley should compile this into deterministic IR with:

- operation identity
- declared authority
- declared read footprint
- declared write footprint
- lawpack digests
- admission guards
- obstruction vocabulary
- witness requirements
- target lowering metadata

## Domain Schema Rules

The normal product schema may expose:

- `Quest`
- `Intent`
- `Campaign`
- `Story`
- `Requirement`
- `Criterion`
- `Evidence`
- `Submission`
- `Review`
- `Decision`
- `Case`
- `Suggestion`
- `DoctorFinding`
- `ReadinessAssessment`
- `AgentBriefing`
- `LandingDashboard`
- `ReviewPage`
- `NowLane`

The normal product schema must not expose:

- `Graph`
- `Node`
- `Edge`
- `Worldline`
- `WarpCore`
- `ProjectionHandle`
- `PatchBuilder`
- `getNodeProps`
- `neighbors`
- `getEdges`
- `_content`
- `materialize`
- raw WARP coordinates as the default user-facing read model

There may eventually be a separate substrate inspection schema for doctor/debug
work. That schema must be capability-gated and must not be used by normal
product surfaces.

## Repository Shape

Proposed source layout:

```text
src/optics/
  questDetail.graphql
  landingDashboard.graphql
  reviewPage.graphql
  nowLane.graphql

src/intents/
  promoteQuest.graphql
  recordComment.graphql
  acceptSuggestion.graphql
  createTraceabilityPacket.graphql

src/lawpacks/
  xyph-core.lawpack.graphql
  xyph-governance.lawpack.graphql
  xyph-agent.lawpack.graphql

src/generated/
  xyph-optics.ts
  xyph-intents.ts
  xyph-lawpack-ir.ts
```

Generated contracts become the application imports. Hand-authored application
code should not import `GraphPort` once an optic or intent has been migrated.

## Migration Program

### Stage 1: Declare one read optic and one write intent

Use a narrow vertical slice:

- `questDetail` optic
- `recordComment` intent

These are small enough to expose the boundary without forcing a dashboard-wide
rewrite.

Current status:

- `recordComment` has landed as a hand-bridged intent slice.
- `questDetail` remains the next optic slice.

### Stage 2: Compile with Wesley into local contracts

The first compiler path may only validate, normalize, and generate TypeScript
contracts. That is acceptable if it records the lawpack metadata and produces a
stable IR artifact.

### Stage 3: Implement over current adapters

The git-warp implementation remains behind infrastructure. The generated
contract calls a domain port, and the adapter translates to WARP operations.

### Stage 4: Ban direct graph access for migrated slices

Once `questDetail` and `recordComment` are migrated, CLI/TUI/domain code for
those paths may not call `GraphPort`, `graph.patch`, `getNodeProps`,
`neighbors`, or `_content`.

### Stage 5: Expand by page and workflow

Recommended order:

1. `questDetail`
2. `recordComment`
3. `reviewPage`
4. `promoteQuest`
5. `acceptSuggestion`
6. `createTraceabilityPacket`
7. `landingDashboard`

### Stage 6: Replace the implementation substrate with Edict

When Edict is operationally online, the GraphQL + lawpack declaration layer
should already be stable enough to lower into Edict without changing XYPH
product surfaces.

## Audit Implications

The first concrete audit report is
[Substrate Decoupling Boundary Audit](../docs/audit/2026-07-01-substrate-decoupling-boundary-audit.md).

During the substrate purge audit, classify red flags this way:

- **Allowed Boundary**: infrastructure adapter code translating generated
  optics/intents into git-warp operations.
- **Temporary Compatibility**: old bridge code being actively replaced by a
  declared optic or intent.
- **Hard Violation**: app/domain/CLI/TUI code directly using graph primitives for
  a behavior that should be an optic or intent.
- **Inspection Exception**: doctor/debug capability that intentionally inspects
  substrate health under a separate capability boundary.

The audit should not merely rename `GraphPort`. It should remove the reason
application code ever wanted it.

## Non-Goals

- Do not build a generic GraphQL graph browser.
- Do not expose WARP nodes, edges, patches, or worldlines as the normal product
  schema.
- Do not turn Wesley into an ambient authority host.
- Do not require Edict to be production-ready before XYPH can define the
  boundary.
- Do not make GraphQL resolvers the new place where business logic hides.

## Playback Questions

1. Can a CLI command or TUI action explain itself as a named domain intent rather
   than a graph patch?
2. Can a read path explain itself as a named optic rather than a traversal?
3. Does the GraphQL schema expose domain facts without exposing substrate
   mechanics?
4. Does the Wesley output record lawpack identity, authority, read/write
   footprint, and witness requirements?
5. Can the current git-warp adapter be replaced by an Edict-backed adapter
   without changing the product-facing operation document?

## Hard Law

GraphQL is allowed because it can describe XYPH's domain contract.

GraphQL is forbidden when it becomes a prettier spelling of `GraphPort`.
