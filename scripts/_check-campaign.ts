#!/usr/bin/env -S npx tsx
/**
 * Scratch: check campaign membership for specific tasks.
 */

import WarpGraph, { GitGraphAdapter } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';

async function main(): Promise<void> {
  const plumbing = Plumbing.createDefault({ cwd: process.cwd() });
  const persistence = new GitGraphAdapter({ plumbing });
  const graph = await WarpGraph.open({ persistence, graphName: 'xyph-roadmap', writerId: 'agent.prime', autoMaterialize: true });
  await graph.syncCoverage();
  await graph.materialize();
  const ids = ['task:AGT-002', 'task:agent-briefing', 'task:OVR-001', 'task:LIN-001', 'task:cli-api'];
  for (const id of ids) {
    const neighbors = await graph.neighbors(id, 'outgoing') as Array<{label: string; nodeId: string}>;
    const campaign = neighbors.find(n => n.label === 'belongs-to' && n.nodeId.startsWith('campaign:'));
    console.log(id.padEnd(25), campaign?.nodeId ?? '(none)');
  }
}

main().catch((err) => {
  console.error(`[FATAL] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
