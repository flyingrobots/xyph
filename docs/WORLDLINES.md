# Worldlines

## Why Worldlines Exist

**The graph is the plan.**
`worldline:live` is the shared, stigmergic coordination surface that humans and agents react to by default.

A derived worldline is **not** a second-class draft or a Git branch with a new name. It is a **candidate continuation of the plan**: a pinned observation plus an overlay patch log stored in git-warp as a working set.

That matters because changing the live plan is not a private act. In XYPH, the shared graph is the environment everyone reacts to. If an agent lands a half-formed structural rewrite directly in `worldline:live`, other agents and humans may immediately re-route work, generate diagnostics against it, or respond to it as if it were settled truth.

Worldlines exist to preserve **signal hygiene** in that shared environment.

## Default Rule

Use `worldline:live` for:

- ordinary execution
- truthful progress/status updates
- routine evidence attachment
- normal collaborative work

Use a derived worldline when the work is:

- speculative
- structurally disruptive
- multi-step and only coherent as a set
- high-blast-radius
- explicitly counterfactual
- intended for review before it becomes shared truth

## Concrete Use Cases

### 1. Structural Replanning

An agent wants to split one quest into five quests, redistribute dependencies, and change ownership. That should not hit the live graph one mutation at a time, because the intermediate states would send misleading stigmergic signals.

```bash
printf '%s\n' \
  '{"v":1,"id":"fork-1","cmd":"fork_worldline","args":{"newWorldlineId":"worldline:plan-rewrite","scope":"campaign restructure"}}' \
  | node ./xyph.ts api
```

The agent can then use `worldline:plan-rewrite` for `history`, `diff`, `apply`, and `observe(conflicts)` without perturbing `worldline:live`.

### 2. High-Blast-Radius What-If Execution

A human or agent wants to know what happens if a submission lineage is rejected, tasks are reopened, and a dependency corridor is rewritten. That is not just a comment or proposal. It is an executable alternative graph state.

### 3. Multi-Step Speculative Execution

Some changes only make sense as a bundle:

- create new nodes
- retarget dependencies
- change statuses
- attach evidence
- rewrite criteria

If those land incrementally in the live graph, the plan is briefly incoherent. A worldline gives that bundle a coherent execution surface.

### 4. Review Lanes

A reviewer can inspect a candidate future instead of a prose suggestion. That lets XYPH answer a stronger question than "what is proposed?":

> What would the plan look like if this path were taken?

### 5. Offline Continuation

Because git-warp is offline-first, an agent can continue from a pinned observation while disconnected or asynchronous, record overlay patches in a working set, and settle those changes later without pretending they were always the shared truth.

### 6. Braided Execution

Some futures are not "pick one branch later." They are "keep one completed support line present while another line continues."

That operation is best described as a **braid**:

- one worldline advances to produce an effect
- that effect is kept co-present as a frozen support line
- another worldline continues on top of the same shared base

Example: one line keeps a gate button depressed while another line advances through the newly opened path. This is not ordinary merge, and it is not Git rebase. It is a way of making two causally meaningful continuations visible at once.

## Why Comments and Proposals Are Not Enough

Comments and proposals are good for discussion and recommendation. They are not enough for:

- executable alternate state
- coherent speculative multi-step mutation
- local causal continuation from a past observation
- time-travel workflows that continue instead of merely inspect

A proposal says **what should happen**.
A worldline says **here is the graph if this path is taken**.

## Control Plane Commands

Worldline operations are available through the `xyph api` control plane:

| Command | What it does |
|---|---|
| `fork_worldline` | Create a derived worldline from live |
| `braid_worldlines` | Keep multiple worldline effects co-present |
| `compare_worldlines` | Factual divergence preview between worldlines |
| `collapse_worldline` | Governed settlement from derived into live |
| `attest` | Record governance attestations (gates for collapse) |

### Governed Settlement Flow

The canonical live collapse flow is:

1. `compare_worldlines persist:true` — record a durable comparison artifact
2. `attest` the returned `comparison-artifact:*` — governance gate
3. `collapse_worldline dryRun:false attestationIds:[...]` — execute live settlement

### Current Limitations

- `collapse_worldline` currently settles into `worldline:live` only
- `rewind_worldline` is reserved but not yet implemented
- Compatibility projections (`observe(slice.local)`, `observe(context)`, etc.) are still catching up to full derived-worldline truth

## Agent Usage

- Stay on `worldline:live` for ordinary low-blast-radius work.
- `fork_worldline` when you need a coherent speculative continuation or a review lane.
- `braid_worldlines` when one continuation needs another's effects to stay co-present.
- `compare_worldlines` before governance or settlement decisions.
- `collapse_worldline` for governed settlement.
- Hand off explicit `worldlineId` values. Do not pass substrate working-set IDs as public handles.

## Terminology

The composition verb in XYPH's ontology is **`braid_worldlines`**. Terms like "rebase," "superpose," or "compose" may appear informally in discussion, but `braid` is the canonical name for keeping multiple worldline-derived effects in play at once.

For the broader technical framing, see [XYPH As A WARP App](XYPH_AS_A_WARP_APP.md).
