/**
 * Runtime type guard for graph neighbor entries.
 *
 * `graph.neighbors()` returns an untyped array. Rather than casting blindly
 * with `as NeighborEntry[]` (L-20), we validate each entry's shape at runtime.
 */
export interface NeighborEntry {
  label: string;
  nodeId: string;
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
