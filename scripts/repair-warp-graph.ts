#!/usr/bin/env -S npx tsx
/**
 * WARP Graph Repair Script
 *
 * Fixes the following graph integrity issues discovered 2026-02-16:
 *
 * 1. campaign:TRIAGE node is missing — TRG-001 and TRG-002 had belongs-to edges
 *    pointing to it but the node was never created. TRG-003 had no campaign edge at all.
 *
 * 2. HRB-001..HRB-004 are marked BACKLOG in the graph but Milestone 2: The Heartbeat
 *    shipped via PR #2 (merge: 1f95484).
 *
 * 3. TRG-001..TRG-003 are marked BACKLOG in the graph but Milestone 3: Triage
 *    shipped via PR #4 (merge: 71eaf4e).
 *
 * Artifact hashes use the format git:<sha> referencing the implementing commit.
 */

import WarpGraph, { GitGraphAdapter } from '@git-stunts/git-warp';
import type { PatchSession } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';
import chalk from 'chalk';

const WRITER_ID = process.env['XYPH_AGENT_ID'] ?? 'agent.james';

const plumbing = Plumbing.createDefault({ cwd: process.cwd() });
const persistence = new GitGraphAdapter({ plumbing });

async function openGraph(): Promise<WarpGraph> {
  const graph = await WarpGraph.open({
    persistence,
    graphName: 'xyph-roadmap',
    writerId: WRITER_ID,
    autoMaterialize: true,
  });
  await graph.syncCoverage();
  await graph.materialize();
  return graph;
}

async function commitPatch(
  graph: WarpGraph,
  label: string,
  fn: (patch: PatchSession) => void,
): Promise<void> {
  const patch = (await graph.createPatch()) as PatchSession;
  fn(patch);
  const sha = await patch.commit();
  console.log(chalk.green(`[OK] ${label} → patch ${sha}`));
}

async function main() {
  console.log(chalk.bold(`\nWARP Graph Repair  (writer: ${WRITER_ID})\n`));

  const graph = await openGraph();

  // ─────────────────────────────────────────────────────────────────────────
  // FIX 1: Create campaign:TRIAGE + connect TRG-003
  // ─────────────────────────────────────────────────────────────────────────
  console.log(chalk.cyan('── Fix 1: campaign:TRIAGE + TRG-003 edge ──'));

  await commitPatch(graph, 'campaign:TRIAGE created, TRG-003 connected', patch => {
    patch
      .addNode('campaign:TRIAGE')
      .setProperty('campaign:TRIAGE', 'title', 'Milestone 3: Triage')
      .setProperty('campaign:TRIAGE', 'status', 'DONE')
      .setProperty('campaign:TRIAGE', 'type', 'campaign')
      .addEdge('campaign:TRIAGE', 'roadmap:ROOT', 'belongs-to')
      // TRG-003 was orphaned — add its missing campaign edge
      .addEdge('task:TRG-003', 'campaign:TRIAGE', 'belongs-to');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // FIX 2: Seal HEARTBEAT tasks (Milestone 2, PR #2 — merge 1f95484)
  // ─────────────────────────────────────────────────────────────────────────
  console.log(chalk.cyan('\n── Fix 2: Seal HEARTBEAT tasks ──'));

  const heartbeatSeals: Array<{ id: string; sha: string; rationale: string }> = [
    {
      id: 'task:HRB-001',
      sha: 'f895b27',
      rationale: 'Hexagonal architecture and CoordinatorService backbone implemented',
    },
    {
      id: 'task:HRB-002',
      sha: '7284fba',
      rationale: 'Phase 1 Ingest pipeline implemented with RawTaskSource and TaskParser',
    },
    {
      id: 'task:HRB-003',
      sha: 'b07afc9',
      rationale: 'Phase 2 Normalize pipeline implemented with NormalizeService',
    },
    {
      id: 'task:HRB-004',
      sha: '56014ec',
      rationale: 'OrchestrationFSM implemented with deterministic state transitions',
    },
  ];

  // Deterministic timestamp: PR #2 merge commit 1f95484 (2026-02-16T02:40:39-08:00)
  const heartbeatMergeAt = 1771238439000;
  for (const { id, sha, rationale } of heartbeatSeals) {
    const scrollId = `artifact:${id}`;
    await commitPatch(graph, `${id} sealed`, patch => {
      patch
        .addNode(scrollId)
        .setProperty(scrollId, 'artifact_hash', `git:${sha}`)
        .setProperty(scrollId, 'rationale', rationale)
        .setProperty(scrollId, 'type', 'scroll')
        .addEdge(scrollId, id, 'fulfills')
        .setProperty(id, 'status', 'DONE')
        .setProperty(id, 'completed_at', heartbeatMergeAt);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FIX 3: Seal TRIAGE tasks (Milestone 3, PR #4 — merge 71eaf4e)
  // ─────────────────────────────────────────────────────────────────────────
  console.log(chalk.cyan('\n── Fix 3: Seal TRIAGE tasks ──'));

  const triageSeals: Array<{ id: string; sha: string; rationale: string }> = [
    {
      id: 'task:TRG-001',
      sha: 'dfeb0cc',
      rationale: 'TriageService and origin context linking implemented',
    },
    {
      id: 'task:TRG-002',
      sha: '5d602db',
      rationale: 'RebalanceService implemented with 160h limit enforcement',
    },
    {
      id: 'task:TRG-003',
      sha: '678abcb',
      rationale: 'Switched to tsx to resolve Node.js deprecation warnings',
    },
  ];

  // Deterministic timestamp: PR #4 merge commit 71eaf4e (2026-02-16T10:11:33-08:00)
  const triageMergeAt = 1771265493000;
  for (const { id, sha, rationale } of triageSeals) {
    const scrollId = `artifact:${id}`;
    await commitPatch(graph, `${id} sealed`, patch => {
      patch
        .addNode(scrollId)
        .setProperty(scrollId, 'artifact_hash', `git:${sha}`)
        .setProperty(scrollId, 'rationale', rationale)
        .setProperty(scrollId, 'type', 'scroll')
        .addEdge(scrollId, id, 'fulfills')
        .setProperty(id, 'status', 'DONE')
        .setProperty(id, 'completed_at', triageMergeAt);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Verify final state
  // ─────────────────────────────────────────────────────────────────────────
  console.log(chalk.cyan('\n── Final graph state ──'));
  await graph.materialize();

  const ids = [
    'campaign:TRIAGE',
    'task:HRB-001', 'task:HRB-002', 'task:HRB-003', 'task:HRB-004',
    'task:TRG-001', 'task:TRG-002', 'task:TRG-003',
  ];

  for (const id of ids) {
    const props = await graph.getNodeProps(id);
    const status = props?.get('status') ?? 'MISSING';
    const icon = status === 'DONE' ? chalk.green('✓') : status === 'BACKLOG' ? chalk.yellow('·') : chalk.red('?');
    console.log(`  ${icon} ${id.padEnd(22)}  ${status}`);
  }

  console.log(chalk.bold.green('\nRepair complete.\n'));
}

main().catch(err => {
  console.error(chalk.red(`[FATAL] ${err instanceof Error ? err.message : String(err)}`));
  process.exit(1);
});
