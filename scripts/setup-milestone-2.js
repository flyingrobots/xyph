import { WarpGraph, GitGraphAdapter } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';

const plumbing = Plumbing.createDefault({ cwd: process.cwd() });
const persistence = new GitGraphAdapter({ plumbing });

async function setup() {
  const graph = await WarpGraph.open({
    persistence,
    graphName: 'xyph-roadmap',
    writerId: 'agent.james',
    autoMaterialize: true,
  });

  await graph.syncCoverage();
  const patch = await graph.createPatch();
  
  patch.addNode('campaign:HEARTBEAT')
    .setProperty('campaign:HEARTBEAT', 'title', 'Milestone 2: The Heartbeat')
    .setProperty('campaign:HEARTBEAT', 'status', 'BACKLOG')
    .setProperty('campaign:HEARTBEAT', 'type', 'task')
    .addEdge('campaign:HEARTBEAT', 'roadmap:ROOT', 'belongs-to');
    
  const sha = await patch.commit();
  console.log(`Campaign HEARTBEAT initialized: ${sha}`);
}

setup().catch(console.error);
