import { WarpGraph, GitGraphAdapter } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';
import chalk from 'chalk';

const plumbing = Plumbing.createDefault({ cwd: process.cwd() });
const persistence = new GitGraphAdapter({ plumbing });

async function inspect() {
  const graph = await WarpGraph.open({
    persistence,
    graphName: 'xyph-roadmap',
    writerId: 'inspector',
    autoMaterialize: true,
  });

  const nodes = await graph.getNodes();
  console.log(chalk.bold(`
--- Current Graph State (${nodes.length} nodes) ---`));

  for (const id of nodes) {
    const props = await graph.getNodeProps(id);
    console.log(chalk.cyan(`
Node: ${id}`));
    console.log(JSON.stringify(Object.fromEntries(props), null, 2));
    
    const neighbors = await graph.neighbors(id, 'outgoing');
    if (neighbors.length > 0) {
      console.log(chalk.gray('  Outgoing Edges:'));
      neighbors.forEach(n => console.log(chalk.gray(`    --[${n.label}]--> ${n.nodeId}`)));
    }
  }

  const writers = await graph.discoverWriters();
  console.log(chalk.bold('\n--- Causal History per Writer ---'));
  
  for (const writerId of writers) {
    console.log(chalk.yellow(`
Writer: ${writerId}`));
    // In git-warp v10.8+, we can use graph.persistence to walk the ref
    const ref = `refs/warp/xyph-roadmap/writers/${writerId}`;
    const log = await persistence.logNodes({ ref, limit: 10 });
    console.log(log);
  }
}

inspect().catch(console.error);
