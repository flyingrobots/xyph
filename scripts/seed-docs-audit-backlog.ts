/**
 * Attach a proper backlog document to task:DOCS-AUDIT.
 *
 * Usage: npx tsx scripts/seed-docs-audit-backlog.ts
 */

import { WarpCore as WarpGraph, GitGraphAdapter } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';
import { resolveGraphRuntime } from '../src/cli/runtimeGraph.js';

const WRITER_ID = 'human.james';
const TASK_ID = 'task:DOCS-AUDIT';

const BODY = `# PROV: Docs directory audit and consolidation

**Legend:** PROV
**Effort:** M

## Problem

The docs/ directory has 41 markdown files across 7 subdirectories with
no clear authority model. Which are current? Which are aspirational?
Which contradict each other? Nobody knows without reading all of them.

### Current inventory

**Root-level loose files (11):**
- WHITEPAPER.md, EXECUTIVE_SUMMARY.md, XYPH_PRODUCT_DESIGN.md,
  XYPH_Workflows.md, XYPH_AS_A_WARP_APP.md — overlapping product
  descriptions at different stages of the project
- GIT-WARP-ALIGNMENT.md, WORLDLINES.md, GUILD_SEALS.md — substrate
  and trust model docs of unknown currency
- CLI-plan.md, bijou-next-plan.md, M11-phase3-design.md — planning
  docs that may be stale

**docs/canonical/ (28 files):**
The "canonical" directory was supposed to be authoritative, but many
of these were written before the sovereign-ontology pivot and the
git-warp CRDT alignment audit (2026-03-07). At least 3 were rewritten
during that audit (APPLY_TRANSACTION_SPEC, ORCHESTRATION_SPEC,
CONSTITUTION). The rest have unknown drift status.

Key concern: the design doc alignment audit (captured in memory)
found that multiple canonical docs described a centralized transaction
model (locks, TXN, snapshot preconditions, rollback) that contradicts
git-warp's CRDT nature. Some were fixed. Were all of them?

**docs/advisory/ (1 file):**
- xyph_advisory_export.md — unclear purpose

**docs/plans/ (1 file):**
- sovereign-ontology-current.md — referenced in CLAUDE.md as the
  active plan, but is it still current after the METHOD adoption?

**docs/work/ (1 file):**
- work.md — unclear purpose

## What this might look like

1. Read every doc. For each, decide: current, stale, or superseded.
2. Stale docs that describe things the code no longer does → delete or
   move to a graveyard/ directory with a note.
3. Docs that overlap → consolidate into one authoritative version.
4. Remaining current docs → evaluate whether they should become
   graph-attached content (per invariant:graph-is-truth) or stay as
   filesystem docs.
5. The canonical/ directory concept needs a decision: is it still the
   right structure, or do invariants + legends + bearings replace it?

## Why it matters

With METHOD adoption, the bearing is the north star document and
invariants are the load-bearing truths. If 41 loose docs exist that
may contradict the bearing or the invariants, new participants (human
or agent) don't know what to trust. The graph-is-truth invariant says
off-graph artifacts are not authoritative — but half the project's
design intent is in these files, not in the graph.

## Priority

After backlog triage. This is a PROV concern — provenance and
traceability of the project's own design intent.
`;

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

  const exists = await graph.hasNode(TASK_ID);
  if (!exists) {
    console.error(`ERROR: ${TASK_ID} not found in graph`);
    process.exit(1);
  }

  const patch = await graph.createPatch();
  await patch.attachContent(TASK_ID, BODY);
  patch.setProperty(TASK_ID, 'description',
    'Audit 41 markdown files in docs/ for currency, authority, and drift. ' +
    'Consolidate overlapping docs, graveyard stale ones, decide what moves into the graph.');
  patch.setProperty(TASK_ID, 'legend', 'PROV');
  const sha = await patch.commit();
  console.log(`ATTACHED backlog doc to ${TASK_ID} (${sha.slice(0, 8)})`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
