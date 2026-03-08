import type { BadgeVariant } from '@flyingrobots/bijou';

/** Map a quest/submission/approval status string to a badge colour variant. */
export function statusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'DONE': case 'MERGED': case 'APPROVED': case 'ACCEPTED': return 'success';
    case 'IN_PROGRESS': case 'OPEN': case 'PENDING': return 'info';
    case 'CHANGES_REQUESTED': case 'BLOCKED': return 'warning';
    case 'CLOSED': case 'GRAVEYARD': case 'REJECTED': return 'error';
    default: return 'muted';
  }
}

/** Format a timestamp as a human-friendly relative age string (e.g. "3d"). */
export function formatAge(ts: number): string {
  if (!Number.isFinite(ts)) return '0m';
  const diff = Math.max(0, Date.now() - ts);
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/** Extract YYYY-MM-DD from an epoch timestamp. */
export function sliceDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

/** Remove a prefix from an ID string (e.g. `stripPrefix('task:X', 'task:')` → `'X'`). */
export function stripPrefix(id: string, prefix: string): string {
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

/** Group an array into a Map keyed by `keyFn`. */
export function groupBy<T>(arr: readonly T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of arr) {
    const key = keyFn(item);
    const group = map.get(key);
    if (group) {
      group.push(item);
    } else {
      map.set(key, [item]);
    }
  }
  return map;
}

/** Build a lookup Map from an array using `keyFn` for the key. */
export function indexBy<T>(arr: readonly T[], keyFn: (item: T) => string): Map<string, T> {
  return new Map(arr.map(item => [keyFn(item), item]));
}
