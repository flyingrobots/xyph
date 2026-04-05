/**
 * Seed the 9 XYPH invariants into the WARP graph with content attachments.
 * Re-running is safe — existing nodes are updated, not duplicated.
 *
 * Usage: npx tsx scripts/seed-invariants.ts
 */

import { WarpCore as WarpGraph, GitGraphAdapter } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';
import { resolveGraphRuntime } from '../src/cli/runtimeGraph.js';

const WRITER_ID = 'human.james';

interface Invariant {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

const INVARIANTS: readonly Invariant[] = [
  {
    id: 'invariant:graph-is-truth',
    title: 'Graph Is Truth',
    body: `# graph-is-truth

## What must remain true?

Nothing is governed or enforceable until it is reified into graph-backed
form. Off-graph artifacts may exist, but they are not authoritative
workflow state.

## Why does it matter?

If workflow truth can live outside the graph — in files, in chat, in
someone's head — then the graph is advisory, not authoritative. Advisory
systems get ignored under pressure. The graph must be the place you go
to know what is real, not a second opinion on what might be real.

Design docs, retros, bearings, and backlog items all live as
content-attached graph nodes. If it governs work, it is in the graph.

## How do you check?

- Every governed workflow artifact (design doc, retro, bearing, backlog
  item) has a corresponding graph node with content attachment.
- \`xyph show <id>\` renders any authoritative artifact from the graph.
- No workflow decision references an off-graph document as its source
  of truth.
- The graph is readable from any git branch — it lives in refs/warp/,
  orthogonal to the working tree.
`,
  },
  {
    id: 'invariant:principal-general-authority',
    title: 'Principal-General Authority',
    body: `# principal-general-authority

## What must remain true?

Humans and agents are first-class principals under one capability model.
Authority flows from policy and explicit grants, not species.

## Why does it matter?

If authority is species-based — "humans approve, agents execute" — then
agents are second-class citizens regardless of what the docs say. A
trusted agent with a guild seal and explicit grants should have the same
authority as a human with the same grants. Conversely, a human without
the right grants should not be able to bypass governance just because
they are human.

The capability model is principal-general: what you can do depends on
who you are and what you have been granted, not what you are.

## How do you check?

- No command or gate checks for \`human.*\` vs \`agent.*\` prefix to
  determine authority. Authority checks inspect grants and policy.
- Interfaces are capability-complete for each principal type: anything
  an agent can do via CLI/API, a human can do via TUI, and vice versa.
- Not all principals must have identical permissions — governed
  restrictions are not inequality.
`,
  },
  {
    id: 'invariant:deterministic-convergence',
    title: 'Deterministic Convergence',
    body: `# deterministic-convergence

## What must remain true?

Under declared merge and policy rules, admissible mutations converge
independent of arrival order.

## Why does it matter?

If two writers emit patches and the final state depends on which patches
arrived first, then the graph is not a CRDT — it is a race condition
with a nice API. Deterministic convergence is the mathematical property
that makes multi-writer coordination trustworthy without locks,
transactions, or a central coordinator.

This is a substrate property inherited from git-warp. XYPH must not
introduce domain logic that breaks it (e.g., order-dependent validation
that rejects patches based on arrival sequence).

## How do you check?

- git-warp's own convergence tests pass.
- XYPH domain validation runs before \`graph.patch()\`, not as a
  centralized gatekeeper that could introduce order dependence.
- No XYPH code inspects patch arrival order to make governance decisions.
`,
  },
  {
    id: 'invariant:immutable-provenance',
    title: 'Immutable Provenance',
    body: `# immutable-provenance

## What must remain true?

Every mutation is an attributed, immutable patch with durable provenance.

## Why does it matter?

If patches can be silently edited, deleted, or disowned after the fact,
then the audit trail is fiction. Provenance means: you can always answer
"who changed this, when, and in what patch" for any property on any node.
Immutability means: the answer doesn't change after the fact.

This is what makes Guild Seals meaningful — you can sign a patch because
the patch will never be altered. It is what makes \`graph.patchesFor()\`
trustworthy — the history is append-only.

## How do you check?

- Every patch carries a writerId attributable to a known principal.
- \`graph.patchesFor(nodeId)\` returns the full causal history.
- No XYPH code calls git operations that would mutate existing refs/warp/
  objects (no rebase, no force-push, no history rewriting on WARP refs).
- Guild Seals can verify patch integrity after the fact.
`,
  },
  {
    id: 'invariant:authorized-intent',
    title: 'Authorized Intent',
    body: `# authorized-intent

## What must remain true?

Governed work requires intent lineage traceable to an authorized
principal.

## Why does it matter?

If work can proceed without traceable authorization, then governance is
theater. Intent lineage answers "why is this work happening and who
authorized it?" for every governed quest. This is not about human
superiority — an authorized agent principal can originate intent. The
key word is "authorized," not "human."

Without intent lineage, the graph accumulates orphan work that no one
asked for and no one can explain.

## How do you check?

- \`xyph audit-sovereignty\` reports zero violations for authorized work.
- Every quest in PLANNED, READY, IN_PROGRESS, or DONE status has an
  \`authorized-by\` edge to an \`intent:*\` node.
- Intent nodes trace to an authorized principal via the capability model.
`,
  },
  {
    id: 'invariant:substrate-boundary',
    title: 'Substrate Boundary',
    body: `# substrate-boundary

## What must remain true?

XYPH never reimplements substrate mechanics owned by git-warp. XYPH owns
ontology, policy, governance, and product meaning; git-warp owns graph
mechanics.

## Why does it matter?

If XYPH reimplements BFS, topological sort, cycle detection, or any
graph primitive, those implementations will diverge from git-warp's
battle-tested versions. They will have different performance
characteristics, different edge-case behavior, and different bugs. Two
sources of graph truth is worse than one.

XYPH's job is to give meaning to the graph — "this node is a quest,
this edge means depends-on, this status means blocked." git-warp's job
is to store, traverse, merge, and replicate the graph.

## How do you check?

- \`scripts/check-graph-algorithms.sh\` scans src/ for telltale patterns
  (queue.shift, stack.pop+visited, in-degree tracking). CI fails if any
  are found.
- No import of graph traversal utilities from anywhere other than
  \`graph.traverse.*\` or \`graph.query()\`.
- Pure domain functions that consume pre-computed results (DP over
  topological order, grouping by levels) are allowed. Reimplementing the
  primitives is not.
`,
  },
  {
    id: 'invariant:policy-is-plastic',
    title: 'Policy Is Plastic',
    body: `# policy-is-plastic

## What must remain true?

Policy is programmable, but policy changes are themselves governed,
attributable, and versioned. Policy can change. Invariants cannot.

## Why does it matter?

If policy is hardcoded, XYPH prescribes one way to work. If policy is
changeable without governance, someone silently rewrites the constitution
at 2 a.m. and no one notices until something breaks.

The middle ground: policy lives in the graph as \`policy:*\` nodes.
Authorized principals can propose, review, and adopt policy changes
through the same governed workflow that applies to all other work. The
policy change itself has provenance, rationale, and an audit trail.

Invariants are the exception — they are the load-bearing properties that
policy changes must not violate. Invariants are the ground rules;
policy is the playbook.

## How do you check?

- Workflow steps, approval gates, readiness requirements, and process
  rules are expressed as \`policy:*\` nodes, not hardcoded in source.
- Policy changes produce patches with writerId attribution.
- No policy change violates an invariant.
- The distinction between policy and invariant is explicit in the schema.
`,
  },
  {
    id: 'invariant:frontier-not-assignment',
    title: 'Frontier Not Assignment',
    body: `# frontier-not-assignment

## What must remain true?

The frontier exposes lawful next work; it does not prescribe who must
do it. Any assignment or ownership must be explicit, governed state,
not inferred from scheduler position.

## Why does it matter?

If the frontier assigns work — "you must do this next" — then XYPH is
a task manager, not a coordination system. Participants should see a
menu of available tasks derived from the dependency DAG and choose based
on their own judgment, capacity, and context.

Explicit claims (via OCP — Optimistic Claiming Protocol) and governed
assignments are fine. The invariant is that the frontier itself is a
read-only projection, not a directive.

## How do you check?

- \`computeFrontier()\` returns available tasks without assignee
  information baked into the ordering.
- Claims are explicit graph mutations (\`xyph claim <id>\`), not implicit
  side effects of frontier position.
- No XYPH code auto-assigns work based on frontier ordering or
  scheduling heuristics.
`,
  },
  {
    id: 'invariant:witness-before-done',
    title: 'Witness Before Done',
    body: `# witness-before-done

## What must remain true?

Done-claims require reproducible witness across human and agent lenses.

## Why does it matter?

If "done" means "someone said it's done," then done means nothing. A
witness is reproducible proof — test output, playback transcripts,
verification commands — that both the human and agent sponsors can
independently validate.

This is the invariant that imports METHOD's sharpest discipline into
XYPH. METHOD says a result is not done unless it is legible, replayable,
and jointly validated. XYPH says the witness lives in the graph as a
content-attached \`evidence:*\` node, not as a file that might be on the
wrong branch.

## How do you check?

- Sealed quests have at least one \`evidence:*\` node with a content
  attachment linked via \`verifies\` edge.
- The witness content is reproducible — running the described
  verification produces the same result.
- Both sponsor perspectives (human and agent) are represented in the
  playback.
`,
  },
];

async function main(): Promise<void> {
  const runtime = resolveGraphRuntime({ cwd: process.cwd() });
  const plumbing = Plumbing.createDefault({ cwd: runtime.repoPath });
  const persistence = new GitGraphAdapter({ plumbing });

  const graph = await WarpGraph.open({
    persistence,
    graphName: runtime.graphName,
    writerId: WRITER_ID,
    autoMaterialize: true,
  });

  await graph.syncCoverage();
  await graph.materialize();

  for (const inv of INVARIANTS) {
    const exists = await graph.hasNode(inv.id);
    if (exists) {
      // Update content on existing node
      const patch = await graph.createPatch();
      await patch.attachContent(inv.id, inv.body);
      patch.setProperty(inv.id, 'title', inv.title);
      patch.setProperty(inv.id, 'updated_at', Date.now());
      const sha = await patch.commit();
      console.log(`UPDATED ${inv.id} (${sha.slice(0, 8)})`);
    } else {
      const patch = await graph.createPatch();
      patch.addNode(inv.id);
      patch.setProperty(inv.id, 'title', inv.title);
      patch.setProperty(inv.id, 'type', 'invariant');
      patch.setProperty(inv.id, 'created_at', Date.now());
      patch.setProperty(inv.id, 'created_by', WRITER_ID);
      await patch.attachContent(inv.id, inv.body);
      const sha = await patch.commit();
      console.log(`ADDED   ${inv.id} (${sha.slice(0, 8)})`);
    }
  }

  console.log('\nDone. 9 invariants committed to graph.');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
