import WarpGraph, { GitGraphAdapter } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';
import { createStylePort } from './infrastructure/adapters/BijouStyleAdapter.js';
import { toNeighborEntries } from './infrastructure/helpers/isNeighborEntry.js';
import { resolveGraphRuntime } from './cli/runtimeGraph.js';

const runtime = resolveGraphRuntime({ cwd: process.cwd() });
const plumbing = Plumbing.createDefault({ cwd: runtime.repoPath });
const persistence = new GitGraphAdapter({ plumbing });

async function inspect(): Promise<void> {
  const style = createStylePort();
  const t = style.theme;

  const graph = await WarpGraph.open({
    persistence,
    graphName: runtime.graphName,
    writerId: 'inspector',
    autoMaterialize: true,
  });

  await graph.syncCoverage();
  await graph.materialize();

  const nodes = await graph.getNodes();
  console.log(style.styled(t.semantic.primary, `\n--- Current Graph State (${nodes.length} nodes) ---`));

  for (const id of nodes) {
    const props = await graph.getNodeProps(id);
    if (!props) continue;
    console.log(style.styled(t.semantic.info, `\nNode: ${id}`));
    console.log(JSON.stringify(props, null, 2));

    const neighbors = toNeighborEntries(await graph.neighbors(id, 'outgoing'));
    if (neighbors.length > 0) {
      console.log(style.styled(t.semantic.muted, '  Outgoing Edges:'));
      for (const n of neighbors) {
        console.log(style.styled(t.semantic.muted, `    --[${n.label}]--> ${n.nodeId}`));
      }
    }
  }

  const writers = await graph.discoverWriters();
  console.log(style.styled(t.semantic.primary, '\n--- Causal History per Writer ---'));

  for (const writerId of writers) {
    console.log(style.styled(t.semantic.warning, `\nWriter: ${writerId}`));
    const ref = `refs/warp/${runtime.graphName}/writers/${writerId}`;
    const log = await persistence.logNodes({ ref, limit: 10, format: '%h %s' });
    console.log(log);
  }
}

inspect().catch(console.error);
