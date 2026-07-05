/**
 * Runtime type guard for graph neighbor entries.
 *
 * WARP neighbor reads return an untyped array. Rather than casting blindly
 * with `as NeighborEntry[]` (L-20), we validate each entry's shape at runtime.
 */
export interface NeighborEntry {
  label: string;
  nodeId: string;
}

interface VisibleEdgeLike {
  from: string;
  to: string;
  label: string;
}

interface EdgeReadable {
  getEdges?: () => Promise<readonly VisibleEdgeLike[]>;
  neighbors?: (
    nodeId: string,
    direction?: 'outgoing' | 'incoming' | 'both',
    edgeLabel?: string,
  ) => Promise<unknown>;
}

export function isNeighborEntry(value: unknown): value is NeighborEntry {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj['label'] === 'string' && typeof obj['nodeId'] === 'string';
}

/**
 * Filters an untyped neighbors array into validated NeighborEntry[].
 */
export function toNeighborEntries(raw: unknown): NeighborEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isNeighborEntry);
}

export async function worldlineNeighbors(
  reader: EdgeReadable,
  nodeId: string,
  direction: 'outgoing' | 'incoming' | 'both' = 'outgoing',
  edgeLabel?: string,
): Promise<NeighborEntry[]> {
  if (reader.neighbors !== undefined) {
    return toNeighborEntries(await reader.neighbors(nodeId, direction, edgeLabel));
  }
  if (reader.getEdges === undefined) return [];

  const edges = await reader.getEdges();
  return edges.flatMap((edge) => {
    if (edgeLabel !== undefined && edge.label !== edgeLabel) return [];
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
}
