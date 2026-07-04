import { WarpGraphAdapter } from './src/infrastructure/adapters/WarpGraphAdapter';
import Plumbing from '@git-stunts/plumbing';
async function run() {
  const adapter = new WarpGraphAdapter(process.cwd(), 'xyph', 'test-writer');
  const graph = await adapter.getGraph();
  try {
    const session = graph.worldline();
    const has = await session.hasNode('some-id');
    console.log('hasNode succeeded:', has);
  } catch (e) {
    console.error('hasNode failed:', e.message);
  }
}
run();
