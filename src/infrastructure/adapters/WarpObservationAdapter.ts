import { type QueryBuilder } from '@git-stunts/git-warp';
import type { EntityDetail, GraphSnapshot } from '../../domain/models/dashboard.js';
import type { GraphPort } from '../../ports/GraphPort.js';
import type {
  ObservationNeighbor,
  ObservationNodeRecord,
  ObservationPort,
  ObservationRequest,
  ObservationSession,
  SnapshotProfile,
} from '../../ports/ObservationPort.js';
import { createObservedGraphProjectionFromGraph } from '../ObservedGraphProjection.js';
import { adaptObservedHandleToObservedProjectionGraph } from './WorldlineObservedProjectionAdapter.js';
import { WarpSubmissionReadAdapter } from '../warp/optics/WarpSubmissionReadAdapter.js';

type QueryResult = Extract<Awaited<ReturnType<QueryBuilder['run']>>, { nodes: unknown }>;
type AggregateResult = Extract<Awaited<ReturnType<QueryBuilder['run']>>, { count?: number }>;

interface QueryNodeLike {
  id?: string;
  props?: Record<string, unknown>;
}

function extractNodes(result: QueryResult | AggregateResult): ObservationNodeRecord[] {
  if (!('nodes' in result)) return [];
  return (result.nodes as QueryNodeLike[]).filter(
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
    const projectionGraph = adaptObservedHandleToObservedProjectionGraph(
      graph,
      observedHandle,
      request.observer?.lens,
    );
    const projection = createObservedGraphProjectionFromGraph(projectionGraph, { syncCoverage: false });

    return {
      fetchSnapshot: (profile: SnapshotProfile = 'operational'): Promise<GraphSnapshot> =>
        projection.fetchSnapshot(undefined, { profile }),
      fetchEntityDetail: (id: string): Promise<EntityDetail | null> => projection.fetchEntityDetail(id),
      getNodeProps: (id: string): Promise<Record<string, unknown> | null> => observedHandle.getNodeProps(id),
      getContent: async (id: string): Promise<string | undefined> => {
        if (!(await observedHandle.hasNode(id))) return undefined;
        try {
          const content = await graph.getContent(id);
          return content ? Buffer.from(content).toString('utf8') : undefined;
        } catch {
          return undefined;
        }
      },
      getContentOid: async (id: string): Promise<string | undefined> => {
        if (!(await observedHandle.hasNode(id))) return undefined;
        try {
          return (await graph.getContentOid(id)) ?? undefined;
        } catch {
          return undefined;
        }
      },
      queryNodes: async (pattern: string): Promise<ObservationNodeRecord[]> =>
        await observedHandle.query().match(pattern).select(['id', 'props']).run().then(extractNodes),
      neighbors: async (
        nodeId: string,
        direction: 'outgoing' | 'incoming' | 'both' = 'outgoing',
        edgeLabel?: string,
      ): Promise<ObservationNeighbor[]> =>
        await projectionGraph.neighbors(nodeId, direction, edgeLabel),
      hasNode: (id: string): Promise<boolean> => observedHandle.hasNode(id),
      getSubmissionLaneCone: (questId: string) =>
        new WarpSubmissionReadAdapter(this.graphPort, { accessorId: 'observation', role: 'observer' }).getSubmissionLaneCone(questId),
    };
  }
}
