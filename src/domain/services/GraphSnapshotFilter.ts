import type { GraphSnapshot } from '../models/dashboard.js';
import type { QuestStatus } from '../entities/Quest.js';

export function filterGraphSnapshot(
  snapshot: GraphSnapshot,
  opts: { includeGraveyard: boolean; backlogOnly?: boolean; rawStatus?: boolean },
): GraphSnapshot {
  let quests = snapshot.quests;
  if (opts.rawStatus) {
    quests = quests.map((q) => ({ ...q, status: (q.rawStatus ?? q.status) as QuestStatus }));
  }
  if (!opts.includeGraveyard) {
    quests = quests.filter((q) => q.status !== 'GRAVEYARD');
  }
  if (opts.backlogOnly) {
    quests = quests.filter((q) => q.status === 'BACKLOG' || q.status === ('INBOX' as QuestStatus));
  }
  if (quests === snapshot.quests) return snapshot;
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
