import type { DashboardReviewLaneData } from '../models/dashboard.js';
import type { ObservationSession } from '../../ports/ObservationPort.js';
import { readSubmissionModel } from './SubmissionReadService.js';

export async function readReviewLaneData(
  session: ObservationSession,
): Promise<DashboardReviewLaneData> {
  const model = await readSubmissionModel(session);
  const activeSubmissions = model.submissions.filter((submission) => {
    if (submission.status === 'MERGED' || submission.status === 'CLOSED') return false;
    const quest = model.questsById.get(submission.questId);
    if (!quest) return false;
    if (quest.status === 'DONE' || quest.status === 'GRAVEYARD') return false;
    return true;
  });
  const questIds = new Set(activeSubmissions.map((submission) => submission.questId));
  const quests = Array.from(model.questsById.values()).filter((quest) => questIds.has(quest.id));
  return {
    submissions: activeSubmissions,
    quests,
  };
}
