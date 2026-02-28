import WarpGraph, { GitGraphAdapter } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';
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
