import type { Observer, WarpCore as WarpGraph, Worldline } from '@git-stunts/git-warp';
import type { ObservedProjectionGraph } from '../ObservedGraphProjection.js';

type ObservedProjectionHandle = Pick<Worldline, 'query' | 'hasNode' | 'getNodeProps' | 'getEdges' | 'traverse'>
  | Pick<Observer, 'query' | 'hasNode' | 'getNodeProps' | 'getEdges' | 'traverse'>;

export function adaptObservedHandleToObservedProjectionGraph(
  graph: WarpGraph,
  handle: ObservedProjectionHandle,
): ObservedProjectionGraph {
  return {
    writerId: graph.writerId,
    query: () => handle.query(),
    hasNode: (nodeId: string) => handle.hasNode(nodeId),
    getNodeProps: (nodeId: string) => handle.getNodeProps(nodeId),
    getStateSnapshot: () => graph.getStateSnapshot(),
    getFrontier: () => graph.getFrontier(),
    getContentOid: (nodeId: string) => graph.getContentOid(nodeId),
    getContent: (nodeId: string) => graph.getContent(nodeId),
    neighbors: async (
      nodeId: string,
      direction: 'outgoing' | 'incoming' | 'both' = 'outgoing',
      edgeLabel?: string,
    ): ReturnType<ObservedProjectionGraph['neighbors']> => {
      const edges = await handle.getEdges();
      return edges.flatMap((edge) => {
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
  };
}
