import { Buffer } from 'node:buffer';
import type { AggregateResult, QueryResultV1 } from '@git-stunts/git-warp';
import type { GraphPort } from '../../ports/GraphPort.js';
import type {
  ObservationNodeRecord,
  ObservationPort,
  ObservationRequest,
  ObservationSession,
  SnapshotProfile,
} from '../../ports/ObservationPort.js';
import { createObservedGraphProjectionFromGraph } from '../ObservedGraphProjection.js';
import { adaptObservedHandleToObservedProjectionGraph } from './WorldlineObservedProjectionAdapter.js';

function extractNodes(result: QueryResultV1 | AggregateResult): ObservationNodeRecord[] {
  if (!('nodes' in result)) return [];
  return result.nodes.filter(
    (node): node is ObservationNodeRecord => typeof node.id === 'string' && node.props !== undefined,
  );
}

export class WarpObservationAdapter implements ObservationPort {
  constructor(private readonly graphPort: GraphPort) {}

  public async openSession(request: ObservationRequest): Promise<ObservationSession> {
    const graph = await this.graphPort.getGraph();
    const worldline = graph.worldline({ source: request.source });
    const observedHandle = request.observer
      ? request.observer.name
        ? await worldline.observer(request.observer.name, request.observer.lens)
        : await worldline.observer(request.observer.lens)
      : worldline;
    const projectionGraph = adaptObservedHandleToObservedProjectionGraph(graph, observedHandle);
    const projection = createObservedGraphProjectionFromGraph(projectionGraph, { syncCoverage: false });

    return {
      fetchSnapshot: (profile: SnapshotProfile = 'operational') =>
        projection.fetchSnapshot(undefined, { profile }),
      fetchEntityDetail: (id: string) => projection.fetchEntityDetail(id),
      getNodeProps: (id: string) => observedHandle.getNodeProps(id),
      getContent: async (id: string) => {
        if (!(await observedHandle.hasNode(id))) return undefined;
        const content = await graph.getContent(id);
        return content ? Buffer.from(content).toString('utf8') : undefined;
      },
      getContentOid: async (id: string) => {
        if (!(await observedHandle.hasNode(id))) return undefined;
        return (await graph.getContentOid(id)) ?? undefined;
      },
      queryNodes: async (pattern: string) =>
        await observedHandle.query().match(pattern).select(['id', 'props']).run().then(extractNodes),
      neighbors: async (nodeId, direction = 'outgoing', edgeLabel) =>
        await projectionGraph.neighbors(nodeId, direction, edgeLabel),
      hasNode: (id: string) => observedHandle.hasNode(id),
    };
  }
}
