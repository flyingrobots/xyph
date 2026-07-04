import { WarpGraphAdapter } from './src/infrastructure/adapters/WarpGraphAdapter';
import Plumbing from '@git-stunts/plumbing';
async function run() {
  const adapter = new WarpGraphAdapter(process.cwd(), 'xyph', 'test-writer');
  const graph = await adapter.getGraph();
  try {
    const session = graph.worldline();
    const nodes = await session.query().match('*').select(['id']).run();
    console.log('worldline query succeeded:', nodes.length);
  } catch (e) {
    console.error('worldline query failed:', e.message);
  }
}
run();
