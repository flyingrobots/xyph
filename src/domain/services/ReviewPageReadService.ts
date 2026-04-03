import type {
  DashboardReviewPageData,
  ScrollNode,
} from '../models/dashboard.js';
import { findSubmissionContext, readSubmissionModel } from './SubmissionReadService.js';
import type { ObservationNeighbor, ObservationSession } from '../../ports/ObservationPort.js';

async function readLatestScrollForQuest(
  session: ObservationSession,
  questId: string,
): Promise<ScrollNode | undefined> {
  const incoming = await session.neighbors(questId, 'incoming', 'fulfills');
  const candidateIds = incoming
    .filter((edge: ObservationNeighbor) => edge.nodeId.startsWith('artifact:'))
    .map((edge) => edge.nodeId);
  if (candidateIds.length === 0) return undefined;

  const candidates = (await Promise.all(candidateIds.map(async (id) => {
    const props = await session.getNodeProps(id);
    if (!props || props['type'] !== 'scroll') return null;

    const artifactHash = props['artifact_hash'];
    const sealedBy = props['sealed_by'];
    const sealedAt = props['sealed_at'];
    if (
      typeof artifactHash !== 'string' ||
      typeof sealedBy !== 'string' ||
      typeof sealedAt !== 'number'
    ) {
      return null;
    }

    return {
      id,
      questId,
      artifactHash,
      sealedBy,
      sealedAt,
      hasSeal: 'guild_seal_sig' in props,
    } satisfies ScrollNode;
  }))).filter((entry): entry is ScrollNode => entry !== null);

  return candidates
    .sort((left, right) => right.sealedAt - left.sealedAt || left.id.localeCompare(right.id))[0];
}

export async function readReviewPageData(
  session: ObservationSession,
  submissionId: string,
  questId: string,
): Promise<DashboardReviewPageData | null> {
  const submissionModel = await readSubmissionModel(session);
  const context = findSubmissionContext(submissionModel, submissionId);
  if (!context?.quest) return null;
  if (context.quest.id !== questId || context.submission.questId !== questId) return null;

  const scroll = await readLatestScrollForQuest(session, questId);
  return {
    quest: context.quest,
    submission: context.submission,
    reviews: context.reviews,
    decisions: context.decisions,
    scroll,
  };
}
