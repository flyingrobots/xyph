import { parentPort, workerData } from 'node:worker_threads';
import { WarpGraphAdapter } from '../../infrastructure/adapters/WarpGraphAdapter.js';

async function main(): Promise<void> {
  if (!workerData) {
    throw new Error('workerData is required');
  }

  const { cwd, graphName, writerId } = workerData;
  const adapter = new WarpGraphAdapter(cwd, graphName, writerId);

  // Suppress logs in the background worker to avoid cluttering TUI
  // We just let it silently sync.

  const graph = await adapter.getGraph();
  if (typeof graph.syncCoverage === 'function') {
    await graph.syncCoverage();
  }

  parentPort?.postMessage({ status: 'done' });
}

main().catch(err => {
  parentPort?.postMessage({ status: 'error', error: err instanceof Error ? err.message : String(err) });
});
