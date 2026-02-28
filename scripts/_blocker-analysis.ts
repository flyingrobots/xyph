import WarpGraph, { GitGraphAdapter } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';

const plumbing = Plumbing.createDefault({ cwd: process.cwd() });
const persistence = new GitGraphAdapter({ plumbing });
const graph = await WarpGraph.open({ persistence, graphName: 'xyph-roadmap', writerId: 'agent.prime', autoMaterialize: true });
await graph.syncCoverage();
await graph.materialize();

const allNodes = await graph.getNodes();
const taskIds = allNodes.filter(n => n.startsWith('task:'));

// Count how many tasks each task transitively blocks
// First build adjacency: task → list of tasks that directly depend on it
const dependents = new Map<string, string[]>();
for (const id of taskIds) {
  const neighbors = await graph.neighbors(id, 'outgoing') as Array<{label: string; nodeId: string}>;
  for (const n of neighbors) {
    if (n.label === 'depends-on') {
      // id depends on n.nodeId, so n.nodeId blocks id
      const arr = dependents.get(n.nodeId) ?? [];
      arr.push(id);
      dependents.set(n.nodeId, arr);
    }
  }
}

// BFS from each non-DONE task to count transitive downstream
const props = new Map<string, string>();
for (const id of taskIds) {
  const p = await graph.getNodeProps(id);
  const raw = (p?.get('status') as string) ?? 'BACKLOG';
  props.set(id, raw);
}

function countTransitiveDownstream(startId: string): string[] {
  const visited = new Set<string>();
  const queue = [startId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const downs = dependents.get(current) ?? [];
    for (const d of downs) {
      if (!visited.has(d)) {
        visited.add(d);
        queue.push(d);
      }
    }
  }
  return [...visited];
}

const results: Array<{id: string; title: string; status: string; direct: number; transitive: number}> = [];
for (const id of taskIds) {
  const p = await graph.getNodeProps(id);
  const status = (p?.get('status') as string) ?? 'BACKLOG';
  if (status === 'DONE') continue;
  const title = (p?.get('title') as string) ?? id;
  const direct = (dependents.get(id) ?? []).length;
  const transitive = countTransitiveDownstream(id);
  if (direct > 0) {
    results.push({ id, title: title.slice(0, 45), status, direct, transitive: transitive.length });
  }
}

results.sort((a, b) => b.transitive - a.transitive);

console.log('Task'.padEnd(30), 'Direct'.padStart(6), 'Trans'.padStart(6), ' Status'.padEnd(12), 'Title');
console.log('-'.repeat(100));
for (const r of results.slice(0, 20)) {
  console.log(r.id.replace('task:','').padEnd(30), String(r.direct).padStart(6), String(r.transitive).padStart(6), ` ${r.status}`.padEnd(12), r.title);
}
