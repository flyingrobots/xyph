#!/usr/bin/env -S npx tsx
/**
 * One-shot script: move ghost/orphan nodes to GRAVEYARD status.
 * Run as: XYPH_AGENT_ID=human.james npx tsx scripts/graveyard-ghosts.mts
 */
import WarpGraph, { GitGraphAdapter } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';
import chalk from 'chalk';
import { createPatchSession } from '../src/infrastructure/helpers/createPatchSession.js';

const agentId = process.env['XYPH_AGENT_ID'] ?? 'human.james';
const now = Date.now();

const GHOSTS: Array<{ id: string; rationale: string }> = [
  { id: 'task:INBOX-TEST-001', rationale: 'Test artifact — promoted from INBOX without sovereign intent, no production value' },
  { id: 'task:INBOX-TEST-002', rationale: 'Test artifact — INBOX test task, no production value' },
  { id: 'roadmap:ROOT',        rationale: 'Obsolete bootstrapping root node, superseded by intent-anchored graph structure' },
  { id: 'artifact:campaign:SOVEREIGNTY', rationale: 'Malformed scroll — attached to a campaign node rather than a quest, no fulfills target' },
];

const plumbing = Plumbing.createDefault({ cwd: process.cwd() });
const persistence = new GitGraphAdapter({ plumbing });

const graph = await WarpGraph.open({
  persistence,
  graphName: 'xyph-roadmap',
  writerId: agentId,
  autoMaterialize: true,
});
await graph.syncCoverage();
await graph.materialize();

const toMutate: Array<{ id: string; rationale: string }> = [];
for (const { id, rationale } of GHOSTS) {
  const props = await graph.getNodeProps(id);
  if (!props) {
    console.log(chalk.yellow(`  [SKIP] ${id} — node not found`));
    continue;
  }
  const current = props.get('status');
  if (current === 'GRAVEYARD') {
    console.log(chalk.dim(`  [SKIP] ${id} — already GRAVEYARD`));
    continue;
  }
  toMutate.push({ id, rationale });
  console.log(chalk.cyan(`  [MARK] ${id}`));
  console.log(chalk.dim(`         ${rationale}`));
}

if (toMutate.length === 0) {
  console.log(chalk.dim('\nNo mutations needed — all ghosts already in GRAVEYARD or not found.'));
} else {
  const patch = await createPatchSession(graph);
  for (const { id, rationale } of toMutate) {
    patch
      .setProperty(id, 'status', 'GRAVEYARD')
      .setProperty(id, 'rejected_by', agentId)
      .setProperty(id, 'rejected_at', now)
      .setProperty(id, 'rejection_rationale', rationale);
  }
  const sha = await patch.commit();
  console.log(chalk.green(`\n[OK] Patch committed: ${sha}`));
  console.log(chalk.dim('Ghost nodes moved to GRAVEYARD — they will be filtered from all dashboard views.'));
}
