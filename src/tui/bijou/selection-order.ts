/**
 * Shared selection-order helpers.
 *
 * These define the canonical ordering of selectable items in each view.
 * Both DashboardApp (for j/k navigation) and view renderers (for visual order)
 * must use the same ordering to prevent wrong-item-selected bugs.
 */

import type { GraphSnapshot, SubmissionNode } from '../../domain/models/dashboard.js';
import { computeFrontier, type TaskSummary, type DepEdge } from '../../domain/services/DepAnalysis.js';
import { SUBMISSION_STATUS_ORDER } from '../../domain/entities/Submission.js';

/** Return ordered quest IDs matching the roadmap frontier panel render order. */
export function roadmapQuestIds(snap: GraphSnapshot): string[] {
  const tasks: TaskSummary[] = snap.quests.map(q => ({
    id: q.id,
    status: q.status,
    hours: q.hours,
  }));
  const edges: DepEdge[] = [];
  for (const q of snap.quests) {
    if (q.dependsOn) {
      for (const dep of q.dependsOn) {
        edges.push({ from: q.id, to: dep });
      }
    }
  }
  if (edges.length === 0) {
    return snap.quests.filter(q => q.status !== 'DONE' && q.status !== 'GRAVEYARD').map(q => q.id);
  }
  const { frontier, blockedBy } = computeFrontier(tasks, edges);
  const graveyardIds = new Set(snap.quests.filter(q => q.status === 'GRAVEYARD').map(q => q.id));
  return [
    ...frontier.filter(id => !graveyardIds.has(id)),
    ...[...blockedBy.keys()].filter(id => !graveyardIds.has(id)).sort(),
  ];
}

/** Return submissions sorted by status priority, then by date descending. */
export function sortedSubmissions(snap: GraphSnapshot): SubmissionNode[] {
  return [...snap.submissions].sort((a, b) => {
    const p = (SUBMISSION_STATUS_ORDER[a.status] ?? 5) - (SUBMISSION_STATUS_ORDER[b.status] ?? 5);
    if (p !== 0) return p;
    return b.submittedAt - a.submittedAt;
  });
}

/** Return ordered submission IDs matching submissions-view sort order. */
export function submissionIds(snap: GraphSnapshot): string[] {
  return sortedSubmissions(snap).map(s => s.id);
}

/** Return ordered backlog quest IDs matching backlog-view rendering order (grouped by suggestedBy). */
export function backlogQuestIds(snap: GraphSnapshot): string[] {
  const backlog = snap.quests.filter(q => q.status === 'BACKLOG');
  const bySuggester = new Map<string, string[]>();
  for (const q of backlog) {
    const key = q.suggestedBy ?? '(unknown suggester)';
    const arr = bySuggester.get(key) ?? [];
    arr.push(q.id);
    bySuggester.set(key, arr);
  }
  return [...bySuggester.values()].flat();
}

/** Return ordered intent IDs for lineage view selection. */
export function lineageIntentIds(snap: GraphSnapshot): string[] {
  return snap.intents.map(i => i.id);
}
