import type { SubmissionReadPort, SubmissionLaneCone } from '../../../ports/SubmissionReadPort.js';
import type { BoundedRead, ReadIdentity } from '../../../ports/ReadTypes.js';
import type { GraphPort } from '../../../ports/GraphPort.js';
import type { QuestStatus } from '../../../domain/entities/Quest.js';
import type { PatchsetRef, ReviewRef, DecisionProps } from '../../../domain/entities/Submission.js';
import { VALID_STATUSES as VALID_QUEST_STATUSES } from '../../../domain/entities/Quest.js';
import { worldlineNeighbors } from '../../helpers/isNeighborEntry.js';

export class WarpSubmissionReadAdapter implements SubmissionReadPort {
  constructor(
    private readonly graphPort: GraphPort,
    private readonly readIdentity: ReadIdentity,
  ) {}

  public async getSubmissionLaneCone(questId: string): Promise<BoundedRead<SubmissionLaneCone> | null> {
    const graph = await this.graphPort.getGraph();
    const reader = typeof (graph as { worldline?: unknown }).worldline === 'function'
      ? graph.worldline()
      : graph;
    const questProps = await reader.getNodeProps(questId);
    if (!questProps) {
      return null;
    }

    const questStatusRaw = questProps['status'];
    const questStatus = typeof questStatusRaw === 'string' && VALID_QUEST_STATUSES.has(questStatusRaw)
      ? questStatusRaw as QuestStatus
      : null;

    // Traversal budget variables
    let nodeCount = 1; // start with quest node
    const maxNodes = 100;
    let completeness: 'complete' | 'truncated' = 'complete';

    // Walk submission nodes (incoming 'submits' edges)
    const submissionNeighbors = await worldlineNeighbors(reader, questId, 'incoming', 'submits');

    const submissions: SubmissionLaneCone['submissions'] = [];
    const openSubmissionIds: string[] = [];
    const patchsetDetails: Record<string, {
      readonly workspaceRef: string | null;
      readonly mergeRef: string | null;
      readonly reviews: ReviewRef[];
    }> = {};

    for (const subNeighbor of submissionNeighbors) {
      if (nodeCount >= maxNodes) {
        completeness = 'truncated';
        break;
      }

      const subId = subNeighbor.nodeId;
      const subProps = await reader.getNodeProps(subId);
      if (!subProps || subProps['type'] !== 'submission') {
        continue;
      }
      nodeCount++;

      const submittedBy = typeof subProps['submitted_by'] === 'string' ? subProps['submitted_by'] : '';
      const submittedAt = typeof subProps['submitted_at'] === 'number' ? subProps['submitted_at'] : 0;

      // Walk patchset nodes (incoming 'has-patchset' edges)
      const patchsetNeighbors = await worldlineNeighbors(reader, subId, 'incoming', 'has-patchset');

      const patchsets: PatchsetRef[] = [];
      for (const patchNeighbor of patchsetNeighbors) {
        if (nodeCount >= maxNodes) {
          completeness = 'truncated';
          break;
        }

        const patchId = patchNeighbor.nodeId;
        const patchProps = await reader.getNodeProps(patchId);
        if (!patchProps || patchProps['type'] !== 'patchset') {
          continue;
        }
        nodeCount++;

        const authoredAt = patchProps['authored_at'];
        if (typeof authoredAt !== 'number') {
          continue;
        }

        const supersedesNeighbors = await worldlineNeighbors(reader, patchId, 'outgoing', 'supersedes');
        const supersedesId = supersedesNeighbors[0]?.nodeId;

        patchsets.push({
          id: patchId,
          authoredAt,
          supersedesId,
        });

        // Resolve workspaceRef and mergeRef
        const workspaceRefRaw = patchProps['workspace_ref'];
        const workspaceRef = typeof workspaceRefRaw === 'string' ? workspaceRefRaw : null;

        const headRef = patchProps['head_ref'];
        let mergeRef: string | null = null;
        if (typeof headRef === 'string' && headRef.trim().length > 0) {
          mergeRef = headRef.trim();
        } else {
          const commitShas = patchProps['commit_shas'];
          if (typeof commitShas === 'string') {
            const firstCommit = commitShas
              .split(',')
              .map((c) => c.trim())
              .find((c) => c.length > 0);
            if (firstCommit) {
              mergeRef = firstCommit;
            }
          }
        }

        // Walk review nodes (incoming 'reviews' edges to this patchset)
        const reviewNeighbors = await worldlineNeighbors(reader, patchId, 'incoming', 'reviews');

        const reviews: ReviewRef[] = [];
        for (const revNeighbor of reviewNeighbors) {
          if (nodeCount >= maxNodes) {
            completeness = 'truncated';
            break;
          }

          const revId = revNeighbor.nodeId;
          const revProps = await reader.getNodeProps(revId);
          if (!revProps || revProps['type'] !== 'review') {
            continue;
          }
          nodeCount++;

          const verdict = revProps['verdict'];
          const reviewedBy = revProps['reviewed_by'];
          const reviewedAt = revProps['reviewed_at'];
          const comment = revProps['comment'];

          if (
            typeof verdict === 'string' &&
            typeof reviewedBy === 'string' &&
            typeof reviewedAt === 'number' &&
            (verdict === 'approve' || verdict === 'request-changes' || verdict === 'comment')
          ) {
            reviews.push({
              id: revId,
              verdict,
              reviewedBy,
              reviewedAt,
              comment: typeof comment === 'string' ? comment : '',
            });
          }
        }

        patchsetDetails[patchId] = {
          workspaceRef,
          mergeRef,
          reviews,
        };
      }

      // Walk decision nodes (incoming 'decides' edges to this submission)
      const decisionNeighbors = await worldlineNeighbors(reader, subId, 'incoming', 'decides');

      const decisions: DecisionProps[] = [];
      let isTerminal = false;
      for (const decNeighbor of decisionNeighbors) {
        if (nodeCount >= maxNodes) {
          completeness = 'truncated';
          break;
        }

        const decId = decNeighbor.nodeId;
        const decProps = await reader.getNodeProps(decId);
        if (!decProps || decProps['type'] !== 'decision') {
          continue;
        }
        nodeCount++;

        const kind = decProps['kind'];
        const decidedBy = decProps['decided_by'];
        const decidedAt = decProps['decided_at'];
        const rationale = decProps['rationale'];

        if (
          typeof kind === 'string' &&
          typeof decidedBy === 'string' &&
          typeof decidedAt === 'number' &&
          typeof rationale === 'string' &&
          (kind === 'merge' || kind === 'close')
        ) {
          if (kind === 'merge' || kind === 'close') {
            isTerminal = true;
          }
          const mergeCommit = decProps['merge_commit'];
          decisions.push({
            id: decId,
            submissionId: subId,
            kind,
            decidedBy,
            decidedAt,
            rationale,
            mergeCommit: typeof mergeCommit === 'string' ? mergeCommit : undefined,
          });
        }
      }

      if (!isTerminal) {
        openSubmissionIds.push(subId);
      }

      submissions.push({
        id: subId,
        submittedBy,
        submittedAt,
        patchsets,
        decisions,
      });
    }

    const value: SubmissionLaneCone = {
      questId,
      questStatus,
      openSubmissionIds,
      submissions,
      patchsetDetails,
    };

    return {
      value,
      completeness,
      cursor: null,
      readIdentity: this.readIdentity,
    };
  }
}
