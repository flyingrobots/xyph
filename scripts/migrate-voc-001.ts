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
import { toNeighborEntries } from '../src/infrastructure/helpers/isNeighborEntry.js';
import { resolveGraphRuntime } from '../src/cli/runtimeGraph.js';

const WRITER_ID = process.env['XYPH_AGENT_ID'] ?? 'agent.prime';
const runtime = resolveGraphRuntime({ cwd: process.cwd() });
const plumbing = Plumbing.createDefault({ cwd: runtime.repoPath });
const persistence = new GitGraphAdapter({ plumbing });

/**
 * Phase 1 renames: unconditional status remap.
 * Phase 2 renames: BACKLOG→PLANNED only for nodes with authorized-by
 * edges and no suggested_by property (old-vocab quest-created nodes).
 */
const PHASE1_RENAMES: Record<string, string> = {
  'INBOX': 'BACKLOG',
};

async function main(): Promise<void> {
  console.log(chalk.bold(`\nVOC-001 Graph Migration  (writer: ${WRITER_ID})\n`));

  const graph = await WarpGraph.open({
    persistence,
    graphName: runtime.graphName,
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

    // Phase 1: unconditional INBOX→BACKLOG
    const phase1 = PHASE1_RENAMES[status];
    if (phase1 !== undefined) {
      toMigrate.push([nodeId, status, phase1]);
      continue;
    }

    // Phase 2: BACKLOG→PLANNED for old-vocab quest-created nodes.
    // Distinguishing criterion: nodes with authorized-by intent edges
    // but no suggested_by property were created via the `quest` command
    // under the old vocabulary (where BACKLOG meant "vetted work").
    // New-vocab BACKLOG nodes (created via `inbox`) always have suggested_by.
    if (status === 'BACKLOG') {
      const suggestedBy = props['suggested_by'] as string | undefined;
      if (suggestedBy !== undefined) continue; // inbox-created, correctly BACKLOG

      const neighbors = toNeighborEntries(await graph.neighbors(nodeId, 'outgoing'));
      const hasIntent = neighbors.some((n) => n.label === 'authorized-by');
      if (hasIntent) {
        toMigrate.push([nodeId, 'BACKLOG', 'PLANNED']);
      }
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
