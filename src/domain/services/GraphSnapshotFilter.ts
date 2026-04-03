import type { GraphSnapshot } from '../models/dashboard.js';

export function filterGraphSnapshot(
  snapshot: GraphSnapshot,
  opts: { includeGraveyard: boolean },
): GraphSnapshot {
  if (opts.includeGraveyard) return snapshot;
  const quests = snapshot.quests.filter((q) => q.status !== 'GRAVEYARD');
  const questIds = new Set(quests.map((q) => q.id));

  const transitiveDownstream = new Map<string, number>();
  for (const [id, count] of snapshot.transitiveDownstream) {
    if (questIds.has(id)) transitiveDownstream.set(id, count);
  }

  return {
    ...snapshot,
    quests,
    scrolls: snapshot.scrolls.filter((s) => questIds.has(s.questId)),
    submissions: snapshot.submissions.filter((s) => questIds.has(s.questId)),
    sortedTaskIds: snapshot.sortedTaskIds.filter((id) => questIds.has(id)),
    transitiveDownstream,
  };
}
