#!/usr/bin/env -S npx tsx
/**
 * Fixup: wire the 5 edges that failed due to truncated task IDs in wave 3.
 */

import WarpGraph, { GitGraphAdapter } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';
import chalk from 'chalk';
import { createPatchSession } from '../src/infrastructure/helpers/createPatchSession.js';

const WRITER_ID = process.env['XYPH_AGENT_ID'] ?? 'agent.prime';
const plumbing = Plumbing.createDefault({ cwd: process.cwd() });
const persistence = new GitGraphAdapter({ plumbing });

const EDGES: Array<[string, string]> = [
  ['task:snapshot-render-regression', 'task:BJU-002'],
  ['task:inline-color-status', 'task:theme-shared-module'],
  ['task:lint-unused-interface-fields', 'task:coverage-threshold'],
  ['task:traceability-m11', 'task:BX-017'],
  ['task:style-guide-md040', 'task:doc-tui-plan-update'],
];

async function main(): Promise<void> {
  const graph = await WarpGraph.open({
    persistence,
    graphName: 'xyph-roadmap',
    writerId: WRITER_ID,
    autoMaterialize: true,
  });
  await graph.syncCoverage();
  await graph.materialize();

  for (const [from, to] of EDGES) {
    const fromExists = await graph.hasNode(from);
    const toExists = await graph.hasNode(to);
    if (!fromExists || !toExists) {
      console.log(chalk.yellow(`  [SKIP] Missing: ${from}=${fromExists}, ${to}=${toExists}`));
      continue;
    }
    const { reachable } = await graph.traverse.isReachable(to, from, {
      labelFilter: 'depends-on',
    });
    if (reachable) {
      console.log(chalk.yellow(`  [CYCLE] ${from} → ${to}`));
      continue;
    }
  }

  const patch = await createPatchSession(graph);
  for (const [from, to] of EDGES) {
    patch.addEdge(from, to, 'depends-on');
  }
  const sha = await patch.commit();
  console.log(chalk.green(`  [OK] 5 fixup edges → ${sha.slice(0, 12)}`));
}

main().catch((err) => {
  console.error(chalk.red(`[FATAL] ${err instanceof Error ? err.message : String(err)}`));
  process.exit(1);
});
