/**
 * Seed the 9 XYPH invariants into the WARP graph with content attachments.
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

Nothing is governed or enforceable until it is reified into graph-backed form.
Off-graph artifacts may exist, but they are not authoritative workflow state.
`,
  },
  {
    id: 'invariant:principal-general-authority',
    title: 'Principal-General Authority',
    body: `# principal-general-authority

Humans and agents are first-class principals under one capability model.
Authority flows from policy and explicit grants, not species.
`,
  },
  {
    id: 'invariant:deterministic-convergence',
    title: 'Deterministic Convergence',
    body: `# deterministic-convergence

Under declared merge and policy rules, admissible mutations converge
independent of arrival order.
`,
  },
  {
    id: 'invariant:immutable-provenance',
    title: 'Immutable Provenance',
    body: `# immutable-provenance

Every mutation is an attributed, immutable patch with durable provenance.
`,
  },
  {
    id: 'invariant:authorized-intent',
    title: 'Authorized Intent',
    body: `# authorized-intent

Governed work requires intent lineage traceable to an authorized principal.
`,
  },
  {
    id: 'invariant:substrate-boundary',
    title: 'Substrate Boundary',
    body: `# substrate-boundary

XYPH never reimplements substrate mechanics owned by git-warp.
XYPH owns ontology, policy, governance, and product meaning;
git-warp owns graph mechanics.
`,
  },
  {
    id: 'invariant:policy-is-plastic',
    title: 'Policy Is Plastic',
    body: `# policy-is-plastic

Policy is programmable, but policy changes are themselves governed,
attributable, and versioned. Policy can change. Invariants cannot.
`,
  },
  {
    id: 'invariant:frontier-not-assignment',
    title: 'Frontier Not Assignment',
    body: `# frontier-not-assignment

The frontier exposes lawful next work; it does not prescribe who must do it.
Any assignment or ownership must be explicit, governed state,
not inferred from scheduler position.
`,
  },
  {
    id: 'invariant:witness-before-done',
    title: 'Witness Before Done',
    body: `# witness-before-done

Done-claims require reproducible witness across human and agent lenses.
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
      console.log(`SKIP  ${inv.id} (already exists)`);
      continue;
    }

    const patch = await graph.createPatch();
    patch.addNode(inv.id);
    patch.setProperty(inv.id, 'title', inv.title);
    patch.setProperty(inv.id, 'type', 'invariant');
    patch.setProperty(inv.id, 'created_at', Date.now());
    patch.setProperty(inv.id, 'created_by', WRITER_ID);
    await patch.attachContent(inv.id, inv.body);
    const sha = await patch.commit();
    console.log(`ADDED ${inv.id} (${sha.slice(0, 8)})`);
  }

  console.log('\nDone. 9 invariants committed to graph.');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
