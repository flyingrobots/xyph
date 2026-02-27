import type { SubmissionPort } from '../../ports/SubmissionPort.js';
import type { GraphPort } from '../../ports/GraphPort.js';
import { toNeighborEntries } from '../helpers/isNeighborEntry.js';
import type { SubmissionReadModel } from '../../domain/services/SubmissionService.js';
import type { QuestStatus } from '../../domain/entities/Quest.js';
import { VALID_STATUSES as VALID_QUEST_STATUSES } from '../../domain/entities/Quest.js';
import type { PatchsetRef, ReviewRef, DecisionProps } from '../../domain/entities/Submission.js';
import type WarpGraph from '@git-stunts/git-warp';

/**
 * WarpSubmissionAdapter — graph-only persistence for the submission lifecycle.
 *
 * Receives a shared GraphPort via DI. All reads auto-materialize.
 * All writes go through graph.patch() and are immediately visible.
 */
export class WarpSubmissionAdapter implements SubmissionPort, SubmissionReadModel {
  constructor(
    private readonly graphPort: GraphPort,
    private readonly agentId: string,
  ) {}

  // =========================================================================
  // Write operations (SubmissionPort)
  // =========================================================================

  public async submit(args: {
    questId: string;
    submissionId: string;
    patchsetId: string;
    patchset: {
      workspaceRef: string;
      baseRef?: string;
      headRef?: string;
      commitShas?: string[];
      description: string;
    };
  }): Promise<{ patchSha: string }> {
    const graph = await this.graphPort.getGraph();
    const now = Date.now();

    const patchSha = await graph.patch((p) => {
      p.addNode(args.submissionId)
        .setProperty(args.submissionId, 'type', 'submission')
        .setProperty(args.submissionId, 'quest_id', args.questId)
        .setProperty(args.submissionId, 'submitted_by', this.agentId)
        .setProperty(args.submissionId, 'submitted_at', now);

      p.addEdge(args.submissionId, args.questId, 'submits');

      p.addNode(args.patchsetId)
        .setProperty(args.patchsetId, 'type', 'patchset')
        .setProperty(args.patchsetId, 'workspace_ref', args.patchset.workspaceRef)
        .setProperty(args.patchsetId, 'description', args.patchset.description)
        .setProperty(args.patchsetId, 'authored_by', this.agentId)
        .setProperty(args.patchsetId, 'authored_at', now);

      if (args.patchset.baseRef) {
        p.setProperty(args.patchsetId, 'base_ref', args.patchset.baseRef);
      }
      if (args.patchset.headRef) {
        p.setProperty(args.patchsetId, 'head_ref', args.patchset.headRef);
      }
      if (args.patchset.commitShas && args.patchset.commitShas.length > 0) {
        p.setProperty(args.patchsetId, 'commit_shas', args.patchset.commitShas.join(','));
      }

      p.addEdge(args.patchsetId, args.submissionId, 'has-patchset');
    });

    return { patchSha };
  }

  public async revise(args: {
    submissionId: string;
    patchsetId: string;
    supersedesPatchsetId: string;
    patchset: {
      workspaceRef: string;
      baseRef?: string;
      headRef?: string;
      commitShas?: string[];
      description: string;
    };
  }): Promise<{ patchSha: string }> {
    const graph = await this.graphPort.getGraph();
    const now = Date.now();

    const patchSha = await graph.patch((p) => {
      p.addNode(args.patchsetId)
        .setProperty(args.patchsetId, 'type', 'patchset')
        .setProperty(args.patchsetId, 'workspace_ref', args.patchset.workspaceRef)
        .setProperty(args.patchsetId, 'description', args.patchset.description)
        .setProperty(args.patchsetId, 'authored_by', this.agentId)
        .setProperty(args.patchsetId, 'authored_at', now);

      if (args.patchset.baseRef) {
        p.setProperty(args.patchsetId, 'base_ref', args.patchset.baseRef);
      }
      if (args.patchset.headRef) {
        p.setProperty(args.patchsetId, 'head_ref', args.patchset.headRef);
      }
      if (args.patchset.commitShas && args.patchset.commitShas.length > 0) {
        p.setProperty(args.patchsetId, 'commit_shas', args.patchset.commitShas.join(','));
      }

      p.addEdge(args.patchsetId, args.submissionId, 'has-patchset');
      p.addEdge(args.patchsetId, args.supersedesPatchsetId, 'supersedes');
    });

    return { patchSha };
  }

  public async review(args: {
    patchsetId: string;
    reviewId: string;
    verdict: 'approve' | 'request-changes' | 'comment';
    comment: string;
  }): Promise<{ patchSha: string }> {
    const graph = await this.graphPort.getGraph();
    const now = Date.now();

    const patchSha = await graph.patch((p) => {
      p.addNode(args.reviewId)
        .setProperty(args.reviewId, 'type', 'review')
        .setProperty(args.reviewId, 'verdict', args.verdict)
        .setProperty(args.reviewId, 'comment', args.comment)
        .setProperty(args.reviewId, 'reviewed_by', this.agentId)
        .setProperty(args.reviewId, 'reviewed_at', now);

      p.addEdge(args.reviewId, args.patchsetId, 'reviews');
    });

    return { patchSha };
  }

  public async decide(args: {
    submissionId: string;
    decisionId: string;
    kind: 'merge' | 'close';
    rationale: string;
    mergeCommit?: string;
  }): Promise<{ patchSha: string }> {
    const graph = await this.graphPort.getGraph();
    const now = Date.now();

    const patchSha = await graph.patch((p) => {
      p.addNode(args.decisionId)
        .setProperty(args.decisionId, 'type', 'decision')
        .setProperty(args.decisionId, 'kind', args.kind)
        .setProperty(args.decisionId, 'decided_by', this.agentId)
        .setProperty(args.decisionId, 'decided_at', now)
        .setProperty(args.decisionId, 'rationale', args.rationale);

      if (args.mergeCommit) {
        p.setProperty(args.decisionId, 'merge_commit', args.mergeCommit);
      }

      p.addEdge(args.decisionId, args.submissionId, 'decides');
    });

    return { patchSha };
  }

  // =========================================================================
  // Read operations (SubmissionReadModel)
  // =========================================================================

  public async getQuestStatus(questId: string): Promise<QuestStatus | null> {
    const graph = await this.graphPort.getGraph();
    const props = await graph.getNodeProps(questId);
    if (!props) return null;
    const status = props.get('status');
    if (typeof status !== 'string' || !VALID_QUEST_STATUSES.has(status)) return null;
    return status as QuestStatus;
  }

  public async getSubmissionQuestId(submissionId: string): Promise<string | null> {
    const graph = await this.graphPort.getGraph();
    const props = await graph.getNodeProps(submissionId);
    if (!props) return null;
    const questId = props.get('quest_id');
    return typeof questId === 'string' ? questId : null;
  }

  public async getOpenSubmissionsForQuest(questId: string): Promise<string[]> {
    const graph = await this.graphPort.getGraph();
    const submissionNeighbors = toNeighborEntries(
      await graph.neighbors(questId, 'incoming', 'submits'),
    );

    const open: string[] = [];
    for (const n of submissionNeighbors) {
      const props = await graph.getNodeProps(n.nodeId);
      if (!props || props.get('type') !== 'submission') continue;

      const decisions = await this._getDecisionsFromGraph(graph, n.nodeId);
      const isTerminal = decisions.some((d) => d.kind === 'merge' || d.kind === 'close');
      if (!isTerminal) {
        open.push(n.nodeId);
      }
    }

    return open;
  }

  public async getPatchsetRefs(submissionId: string): Promise<PatchsetRef[]> {
    const graph = await this.graphPort.getGraph();
    const patchsetNeighbors = toNeighborEntries(
      await graph.neighbors(submissionId, 'incoming', 'has-patchset'),
    );

    const refs: PatchsetRef[] = [];
    for (const n of patchsetNeighbors) {
      const props = await graph.getNodeProps(n.nodeId);
      if (!props || props.get('type') !== 'patchset') continue;

      const authoredAt = props.get('authored_at');
      if (typeof authoredAt !== 'number') continue;

      const outgoing = toNeighborEntries(await graph.neighbors(n.nodeId, 'outgoing', 'supersedes'));
      const ref: PatchsetRef = {
        id: n.nodeId,
        authoredAt,
        supersedesId: outgoing[0]?.nodeId,
      };
      refs.push(ref);
    }

    return refs;
  }

  public async getSubmissionForPatchset(patchsetId: string): Promise<string | null> {
    const graph = await this.graphPort.getGraph();
    const neighbors = toNeighborEntries(await graph.neighbors(patchsetId, 'outgoing'));
    for (const n of neighbors) {
      if (n.label === 'has-patchset' && n.nodeId.startsWith('submission:')) {
        return n.nodeId;
      }
    }
    return null;
  }

  public async getPatchsetWorkspaceRef(patchsetId: string): Promise<string | null> {
    const graph = await this.graphPort.getGraph();
    const props = await graph.getNodeProps(patchsetId);
    if (!props) return null;
    const workspaceRef = props.get('workspace_ref');
    return typeof workspaceRef === 'string' ? workspaceRef : null;
  }

  public async getReviewsForPatchset(patchsetId: string): Promise<ReviewRef[]> {
    const graph = await this.graphPort.getGraph();
    const reviewNeighbors = toNeighborEntries(
      await graph.neighbors(patchsetId, 'incoming', 'reviews'),
    );

    const reviews: ReviewRef[] = [];
    for (const n of reviewNeighbors) {
      const props = await graph.getNodeProps(n.nodeId);
      if (!props || props.get('type') !== 'review') continue;

      const verdict = props.get('verdict');
      const reviewedBy = props.get('reviewed_by');
      const reviewedAt = props.get('reviewed_at');
      if (
        typeof verdict !== 'string' ||
        typeof reviewedBy !== 'string' ||
        typeof reviewedAt !== 'number'
      ) {
        continue;
      }
      if (verdict !== 'approve' && verdict !== 'request-changes' && verdict !== 'comment') {
        continue;
      }

      reviews.push({ id: n.nodeId, verdict, reviewedBy, reviewedAt });
    }

    return reviews;
  }

  public async getDecisionsForSubmission(submissionId: string): Promise<DecisionProps[]> {
    const graph = await this.graphPort.getGraph();
    return this._getDecisionsFromGraph(graph, submissionId);
  }

  // =========================================================================
  // Internal helpers
  // =========================================================================

  private async _getDecisionsFromGraph(
    graph: WarpGraph,
    submissionId: string,
  ): Promise<DecisionProps[]> {
    const decisionNeighbors = toNeighborEntries(
      await graph.neighbors(submissionId, 'incoming', 'decides'),
    );

    const decisions: DecisionProps[] = [];
    for (const n of decisionNeighbors) {
      const props = await graph.getNodeProps(n.nodeId);
      if (!props || props.get('type') !== 'decision') continue;

      const kind = props.get('kind');
      const decidedBy = props.get('decided_by');
      const decidedAt = props.get('decided_at');
      const rationale = props.get('rationale');
      if (
        typeof kind !== 'string' ||
        typeof decidedBy !== 'string' ||
        typeof decidedAt !== 'number' ||
        typeof rationale !== 'string'
      ) {
        continue;
      }
      if (kind !== 'merge' && kind !== 'close') continue;

      const mergeCommit = props.get('merge_commit');
      decisions.push({
        id: n.nodeId,
        submissionId,
        kind,
        decidedBy,
        decidedAt,
        rationale,
        mergeCommit: typeof mergeCommit === 'string' ? mergeCommit : undefined,
      });
    }

    return decisions;
  }
}
