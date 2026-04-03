import type { DashboardReviewLaneData } from '../models/dashboard.js';
import type { ObservationSession } from '../../ports/ObservationPort.js';
import { readSubmissionModel } from './SubmissionReadService.js';

export async function readReviewLaneData(
  session: ObservationSession,
): Promise<DashboardReviewLaneData> {
  const model = await readSubmissionModel(session);
  const questIds = new Set(model.submissions.map((submission) => submission.questId));
  const quests = Array.from(model.questsById.values()).filter((quest) => questIds.has(quest.id));
  return {
    submissions: model.submissions,
    quests,
  };
}
