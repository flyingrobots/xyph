#!/usr/bin/env -S npx tsx
/**
 * Scratch: check status properties for specific tasks.
 */

import WarpGraph, { GitGraphAdapter } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';

async function main(): Promise<void> {
  const plumbing = Plumbing.createDefault({ cwd: process.cwd() });
  const persistence = new GitGraphAdapter({ plumbing });
  const graph = await WarpGraph.open({ persistence, graphName: 'xyph-roadmap', writerId: 'agent.prime', autoMaterialize: true });
  await graph.syncCoverage();
  await graph.materialize();
  const ids = ['task:BX-001', 'task:BJU-009', 'task:ORC-001', 'task:cli-api', 'task:OVR-012', 'task:GRV-001', 'task:FRG-001', 'task:DSH-002'];
  for (const id of ids) {
    const props = await graph.getNodeProps(id);
    const status = props?.get('status');
    console.log(id.padEnd(20), typeof status, JSON.stringify(status));
  }
}

main().catch((err) => {
  console.error(`[FATAL] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
