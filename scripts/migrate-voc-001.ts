#!/usr/bin/env -S npx tsx
/**
 * VOC-001 Graph Migration: Rename raw status values.
 *
 * Patches all nodes in the WARP graph that still use legacy status values:
 *   INBOX  → BACKLOG  (suggestion pool)
 *   BACKLOG → PLANNED  (vetted work, pre-VOC rename used BACKLOG for this)
 *
 * Idempotent — safe to re-run. Nodes already using the new vocabulary
 * are skipped.
 */

import WarpGraph, { GitGraphAdapter } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';
import chalk from 'chalk';
import { createPatchSession } from '../src/infrastructure/helpers/createPatchSession.js';

const WRITER_ID = process.env['XYPH_AGENT_ID'] ?? 'agent.prime';
const plumbing = Plumbing.createDefault({ cwd: process.cwd() });
const persistence = new GitGraphAdapter({ plumbing });

const RENAMES: Record<string, string> = {
  'INBOX': 'BACKLOG',
  // NOTE: We do NOT rename BACKLOG→PLANNED here because we cannot
  // distinguish old-vocab BACKLOG (meaning "vetted work") from
  // new-vocab BACKLOG (meaning "suggestion pool"). The new code
  // already writes BACKLOG for suggestions and PLANNED for vetted
  // work, so only un-migrated INBOX nodes need patching.
};

async function main(): Promise<void> {
  console.log(chalk.bold(`\nVOC-001 Graph Migration  (writer: ${WRITER_ID})\n`));

  const graph = await WarpGraph.open({
    persistence,
    graphName: 'xyph-roadmap',
    writerId: WRITER_ID,
    autoMaterialize: true,
  });
  await graph.syncCoverage();
  await graph.materialize();

  const allNodes = await graph.getNodes();
  const taskNodes = allNodes.filter((n) => n.startsWith('task:'));

  console.log(chalk.cyan(`── Scanning ${taskNodes.length} task nodes ──`));

  const toMigrate: [string, string, string][] = []; // [nodeId, oldStatus, newStatus]

  for (const nodeId of taskNodes) {
    const props = await graph.getNodeProps(nodeId);
    const status = props?.['status'] as string | undefined;
    if (status === undefined) continue;

    const newStatus = RENAMES[status];
    if (newStatus !== undefined) {
      toMigrate.push([nodeId, status, newStatus]);
    }
  }

  if (toMigrate.length === 0) {
    console.log(chalk.green('\n  No legacy status values found. Graph already migrated.'));
    return;
  }

  console.log(chalk.yellow(`\n  Found ${toMigrate.length} node(s) to migrate:`));
  for (const [nodeId, oldStatus, newStatus] of toMigrate) {
    console.log(`    ${nodeId}: ${oldStatus} → ${newStatus}`);
  }

  const patch = await createPatchSession(graph);
  for (const [nodeId, , newStatus] of toMigrate) {
    patch.setProperty(nodeId, 'status', newStatus);
  }
  const sha = await patch.commit();
  console.log(chalk.green(`\n  [OK] Migrated ${toMigrate.length} node(s) → ${sha.slice(0, 12)}`));
}

main().catch((err) => {
  console.error(chalk.red(`[FATAL] ${err instanceof Error ? err.message : String(err)}`));
  process.exit(1);
});
