import type { DashboardReviewLaneData } from '../models/dashboard.js';
import type { ObservationSession } from '../../ports/ObservationPort.js';
import { readSubmissionModel } from './SubmissionReadService.js';

export async function readReviewLaneData(
  session: ObservationSession,
): Promise<DashboardReviewLaneData> {
  const model = await readSubmissionModel(session);
  const activeSubmissions = model.submissions.filter(
    (submission) => submission.status !== 'MERGED' && submission.status !== 'CLOSED'
  );
  const questIds = new Set(activeSubmissions.map((submission) => submission.questId));
  const quests = Array.from(model.questsById.values()).filter((quest) => questIds.has(quest.id));
  return {
    submissions: activeSubmissions,
    quests,
  };
}
