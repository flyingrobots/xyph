import type {
  AttestationNode,
  ComparisonArtifactNode,
  CollapseProposalNode,
  DashboardNowLaneData,
  EntityDetail,
  GovernanceArtifactNode,
} from '../models/dashboard.js';
import type { ObservationSession } from '../../ports/ObservationPort.js';
import { readAiSuggestions } from './AiSuggestionReadService.js';
import { readSubmissionModel } from './SubmissionReadService.js';

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function governanceArtifactFromDetail(detail: EntityDetail): GovernanceArtifactNode | null {
  if (detail.type === 'comparison-artifact' && detail.governanceDetail?.kind === 'comparison-artifact') {
    const artifact: ComparisonArtifactNode = {
      id: detail.id,
      type: 'comparison-artifact',
      recordedAt: asNumber(detail.props['recorded_at']) ?? 0,
      governance: detail.governanceDetail,
      ...(asString(detail.props['recorded_by']) ? { recordedBy: asString(detail.props['recorded_by']) } : {}),
      ...(asString(detail.props['left_worldline_id']) ? { leftWorldlineId: asString(detail.props['left_worldline_id']) } : {}),
      ...(asString(detail.props['right_worldline_id']) ? { rightWorldlineId: asString(detail.props['right_worldline_id']) } : {}),
      ...(asString(detail.props['target_id']) ? { targetId: asString(detail.props['target_id']) } : {}),
    };
    return artifact;
  }

  if (detail.type === 'collapse-proposal' && detail.governanceDetail?.kind === 'collapse-proposal') {
    const artifact: CollapseProposalNode = {
      id: detail.id,
      type: 'collapse-proposal',
      recordedAt: asNumber(detail.props['recorded_at']) ?? 0,
      governance: detail.governanceDetail,
      ...(asString(detail.props['recorded_by']) ? { recordedBy: asString(detail.props['recorded_by']) } : {}),
      ...(asString(detail.props['source_worldline_id']) ? { sourceWorldlineId: asString(detail.props['source_worldline_id']) } : {}),
      ...(asString(detail.props['target_worldline_id']) ? { targetWorldlineId: asString(detail.props['target_worldline_id']) } : {}),
      ...(typeof detail.governanceDetail.executionGate.comparisonArtifactId === 'string'
        ? { comparisonArtifactId: detail.governanceDetail.executionGate.comparisonArtifactId }
        : {}),
    };
    return artifact;
  }

  if (detail.type === 'attestation' && detail.governanceDetail?.kind === 'attestation') {
    const artifact: AttestationNode = {
      id: detail.id,
      type: 'attestation',
      recordedAt: asNumber(detail.props['attested_at']) ?? 0,
      governance: detail.governanceDetail,
      ...(asString(detail.props['attested_by']) ? { recordedBy: asString(detail.props['attested_by']) } : {}),
      ...(asString(detail.props['target_id']) ? { targetId: asString(detail.props['target_id']) } : {}),
    };
    return artifact;
  }

  return null;
}

async function readGovernanceArtifacts(
  session: Pick<ObservationSession, 'queryNodes' | 'fetchEntityDetail'>,
): Promise<GovernanceArtifactNode[]> {
  const [comparisonNodes, collapseNodes, attestationNodes] = await Promise.all([
    session.queryNodes('comparison-artifact:*'),
    session.queryNodes('collapse-proposal:*'),
    session.queryNodes('attestation:*'),
  ]);

  const details = await Promise.all(
    [...comparisonNodes, ...collapseNodes, ...attestationNodes].map(async (node) => await session.fetchEntityDetail(node.id)),
  );

  return details
    .map((detail) => (detail ? governanceArtifactFromDetail(detail) : null))
    .filter((artifact): artifact is GovernanceArtifactNode => artifact !== null)
    .sort((left, right) => right.recordedAt - left.recordedAt || left.id.localeCompare(right.id));
}

export async function readNowLaneData(
  session: ObservationSession,
): Promise<DashboardNowLaneData> {
  const [submissionModel, aiSuggestions, governanceArtifacts] = await Promise.all([
    readSubmissionModel(session),
    readAiSuggestions(session),
    readGovernanceArtifacts(session),
  ]);

  return {
    quests: Array.from(submissionModel.questsById.values()),
    submissions: submissionModel.submissions,
    reviews: submissionModel.reviews,
    decisions: submissionModel.decisions,
    governanceArtifacts,
    aiSuggestions,
  };
}
