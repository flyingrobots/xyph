import type { Observer, WarpCore as WarpGraph, ProjectionHandle as Worldline } from '@git-stunts/git-warp';
import type { ObservedProjectionGraph } from '../ObservedGraphProjection.js';

type ObservedProjectionHandle = Pick<Worldline, 'query' | 'hasNode' | 'getNodeProps' | 'getEdges' | 'traverse'>
  | Pick<Observer, 'query' | 'hasNode' | 'getNodeProps' | 'getEdges' | 'traverse'>;

export function adaptObservedHandleToObservedProjectionGraph(
  graph: WarpGraph,
  handle: ObservedProjectionHandle,
  lens?: { match?: string | string[] },
): ObservedProjectionGraph {
  let cachedEdgesPromise: ReturnType<ObservedProjectionHandle['getEdges']> | null = null;
  return {
    writerId: graph.writerId,
    query: () => handle.query(),
    hasNode: (nodeId: string) => handle.hasNode(nodeId),
    getNodeProps: (nodeId: string) => handle.getNodeProps(nodeId),
    getStateSnapshot: () => graph.getStateSnapshot(),
    getFrontier: () => graph.getFrontier(),
    getContentOid: async (nodeId: string): Promise<string | null> => {
      try {
        return await graph.getContentOid(nodeId);
      } catch {
        return null;
      }
    },
    getContent: async (nodeId: string): Promise<Uint8Array | null> => {
      try {
        return await graph.getContent(nodeId);
      } catch {
        return null;
      }
    },
    neighbors: async (
      nodeId: string,
      direction: 'outgoing' | 'incoming' | 'both' = 'outgoing',
      edgeLabel?: string,
    ): ReturnType<ObservedProjectionGraph['neighbors']> => {
      if (!cachedEdgesPromise) {
        cachedEdgesPromise = handle.getEdges();
      }
      const edges = await cachedEdgesPromise;
      return edges.flatMap((edge: { label: string; from: string; to: string }) => {
        if (edgeLabel && edge.label !== edgeLabel) return [];
        if (direction === 'outgoing' && edge.from === nodeId) {
          return [{ label: edge.label, nodeId: edge.to }];
        }
        if (direction === 'incoming' && edge.to === nodeId) {
          return [{ label: edge.label, nodeId: edge.from }];
        }
        if (direction === 'both') {
          if (edge.from === nodeId) return [{ label: edge.label, nodeId: edge.to }];
          if (edge.to === nodeId) return [{ label: edge.label, nodeId: edge.from }];
        }
        return [];
      });
    },
    traverse: handle.traverse,
    compareCoordinates: graph.compareCoordinates.bind(graph),
    lens,
    isLive: false,
  };
}
