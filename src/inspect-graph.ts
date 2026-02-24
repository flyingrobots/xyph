import WarpGraph, { GitGraphAdapter } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';
import { getTheme, styled } from './tui/theme/index.js';
import { toNeighborEntries } from './infrastructure/helpers/isNeighborEntry.js';

const plumbing = Plumbing.createDefault({ cwd: process.cwd() });
const persistence = new GitGraphAdapter({ plumbing });

async function inspect(): Promise<void> {
  const t = getTheme().theme;

  const graph = await WarpGraph.open({
    persistence,
    graphName: 'xyph-roadmap',
    writerId: 'inspector',
    autoMaterialize: true,
  });

  await graph.syncCoverage();
  await graph.materialize();

  const nodes = await graph.getNodes();
  console.log(styled(t.semantic.primary, `\n--- Current Graph State (${nodes.length} nodes) ---`));

  for (const id of nodes) {
    const props = await graph.getNodeProps(id);
    if (!props) continue;
    console.log(styled(t.semantic.info, `\nNode: ${id}`));
    console.log(JSON.stringify(Object.fromEntries(props), null, 2));

    const neighbors = toNeighborEntries(await graph.neighbors(id, 'outgoing'));
    if (neighbors.length > 0) {
      console.log(styled(t.semantic.muted, '  Outgoing Edges:'));
      for (const n of neighbors) {
        console.log(styled(t.semantic.muted, `    --[${n.label}]--> ${n.nodeId}`));
      }
    }
  }

  const writers = await graph.discoverWriters();
  console.log(styled(t.semantic.primary, '\n--- Causal History per Writer ---'));

  for (const writerId of writers) {
    console.log(styled(t.semantic.warning, `\nWriter: ${writerId}`));
    const ref = `refs/warp/xyph-roadmap/writers/${writerId}`;
    const log = await persistence.logNodes({ ref, limit: 10, format: '%h %s' });
    console.log(log);
  }
}

inspect().catch(console.error);
