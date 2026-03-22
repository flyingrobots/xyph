import type { BadgeVariant } from '@flyingrobots/bijou';

/** Map a quest/submission/approval status string to a badge colour variant. */
export function statusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'DONE': case 'MERGED': case 'APPROVED': case 'ACCEPTED': return 'success';
    case 'READY': case 'IN_PROGRESS': case 'OPEN': case 'PENDING': return 'info';
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

/** Extract YYYY-MM-DD from an epoch timestamp. Returns '—' for non-finite values. */
export function sliceDate(ts: number): string {
  if (!Number.isFinite(ts)) return '—';
  return new Date(ts).toISOString().slice(0, 10);
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

/** Wrap text on whitespace boundaries, preserving explicit newlines. */
export function wrapWhitespaceText(text: string, width: number): string[] {
  return text
    .split('\n')
    .flatMap((line) => wrapWhitespaceParagraph(line, width));
}

function wrapWhitespaceParagraph(text: string, width: number): string[] {
  const safeWidth = Math.max(1, width);
  const lines: string[] = [];
  let remaining = text.trimEnd();
  if (remaining.length === 0) return [''];
  while (remaining.length > safeWidth) {
    let wrapIndex = safeWidth;
    if (!/\s/.test(remaining[wrapIndex] ?? '')) {
      for (let cursor = wrapIndex; cursor >= 0; cursor -= 1) {
        if (/\s/.test(remaining[cursor] ?? '')) {
          wrapIndex = cursor;
          break;
        }
      }
    }
    if (wrapIndex <= 0) wrapIndex = safeWidth;
    const line = remaining.slice(0, wrapIndex).trimEnd();
    lines.push(line.length > 0 ? line : remaining.slice(0, safeWidth));
    remaining = remaining.slice(wrapIndex).trimStart();
  }
  if (remaining.length > 0) lines.push(remaining);
  return lines;
}
