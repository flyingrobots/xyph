import { randomUUID } from 'node:crypto';

/**
 * Generates a short unique ID for graph nodes.
 * Format: 9-char zero-padded base36 timestamp + 8-char hex random suffix (17 chars total).
 * Lexicographically sortable by creation time (covers until year 5188).
 */
export function generateId(): string {
  const ts = Date.now().toString(36).padStart(9, '0');
  const rand = randomUUID().replace(/-/g, '').slice(0, 8);
  return `${ts}${rand}`;
}
