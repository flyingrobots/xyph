import type { SubmissionPort } from '../../ports/SubmissionPort.js';
import { createPatchSession } from '../helpers/createPatchSession.js';
import { WarpGraphHolder } from '../helpers/WarpGraphHolder.js';
import { toNeighborEntries } from '../helpers/isNeighborEntry.js';
import type { SubmissionReadModel } from '../../domain/services/SubmissionService.js';
import type { QuestStatus } from '../../domain/entities/Quest.js';
import { VALID_STATUSES as VALID_QUEST_STATUSES } from '../../domain/entities/Quest.js';
import type { PatchsetRef, ReviewRef, DecisionProps } from '../../domain/entities/Submission.js';
import type WarpGraph from '@git-stunts/git-warp';

/**
 * WarpSubmissionAdapter — graph-only persistence for the submission lifecycle.
 * Implements both the write port (SubmissionPort) and read model (SubmissionReadModel)
 * needed by SubmissionService.
 */
export class WarpSubmissionAdapter implements SubmissionPort, SubmissionReadModel {
  private readonly graphHolder: WarpGraphHolder;

  constructor(
    cwd: string,
    private readonly agentId: string,
  ) {
    this.graphHolder = new WarpGraphHolder(cwd, 'xyph-roadmap', agentId);
  }

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
    const graph = await this.graphHolder.getGraph();
    await graph.syncCoverage();
    await graph.materialize();

    const now = Date.now();
    const patch = await createPatchSession(graph);

    // Create submission node
    patch
      .addNode(args.submissionId)
      .setProperty(args.submissionId, 'type', 'submission')
      .setProperty(args.submissionId, 'quest_id', args.questId)
      .setProperty(args.submissionId, 'submitted_by', this.agentId)
      .setProperty(args.submissionId, 'submitted_at', now);

    // submits edge: submission → quest
    patch.addEdge(args.submissionId, args.questId, 'submits');

    // Create first patchset node
    patch
      .addNode(args.patchsetId)
      .setProperty(args.patchsetId, 'type', 'patchset')
      .setProperty(args.patchsetId, 'workspace_ref', args.patchset.workspaceRef)
      .setProperty(args.patchsetId, 'description', args.patchset.description)
      .setProperty(args.patchsetId, 'authored_by', this.agentId)
      .setProperty(args.patchsetId, 'authored_at', now);

    if (args.patchset.baseRef) {
      patch.setProperty(args.patchsetId, 'base_ref', args.patchset.baseRef);
    }
    if (args.patchset.headRef) {
      patch.setProperty(args.patchsetId, 'head_ref', args.patchset.headRef);
    }
    if (args.patchset.commitShas && args.patchset.commitShas.length > 0) {
      patch.setProperty(args.patchsetId, 'commit_shas', args.patchset.commitShas.join(','));
    }

    // has-patchset edge: patchset → submission
    patch.addEdge(args.patchsetId, args.submissionId, 'has-patchset');

    const patchSha = await patch.commit();
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
    const graph = await this.graphHolder.getGraph();
    await graph.syncCoverage();
    await graph.materialize();

    const now = Date.now();
    const patch = await createPatchSession(graph);

    // Create new patchset node
    patch
      .addNode(args.patchsetId)
      .setProperty(args.patchsetId, 'type', 'patchset')
      .setProperty(args.patchsetId, 'workspace_ref', args.patchset.workspaceRef)
      .setProperty(args.patchsetId, 'description', args.patchset.description)
      .setProperty(args.patchsetId, 'authored_by', this.agentId)
      .setProperty(args.patchsetId, 'authored_at', now);

    if (args.patchset.baseRef) {
      patch.setProperty(args.patchsetId, 'base_ref', args.patchset.baseRef);
    }
    if (args.patchset.headRef) {
      patch.setProperty(args.patchsetId, 'head_ref', args.patchset.headRef);
    }
    if (args.patchset.commitShas && args.patchset.commitShas.length > 0) {
      patch.setProperty(args.patchsetId, 'commit_shas', args.patchset.commitShas.join(','));
    }

    // has-patchset edge: new patchset → submission
    patch.addEdge(args.patchsetId, args.submissionId, 'has-patchset');

    // supersedes edge: new patchset → old patchset
    patch.addEdge(args.patchsetId, args.supersedesPatchsetId, 'supersedes');

    const patchSha = await patch.commit();
    return { patchSha };
  }

  public async review(args: {
    patchsetId: string;
    reviewId: string;
    verdict: 'approve' | 'request-changes' | 'comment';
    comment: string;
  }): Promise<{ patchSha: string }> {
    const graph = await this.graphHolder.getGraph();
    await graph.syncCoverage();
    await graph.materialize();

    const now = Date.now();
    const patch = await createPatchSession(graph);

    // Create review node
    patch
      .addNode(args.reviewId)
      .setProperty(args.reviewId, 'type', 'review')
      .setProperty(args.reviewId, 'verdict', args.verdict)
      .setProperty(args.reviewId, 'comment', args.comment)
      .setProperty(args.reviewId, 'reviewed_by', this.agentId)
      .setProperty(args.reviewId, 'reviewed_at', now);

    // reviews edge: review → patchset
    patch.addEdge(args.reviewId, args.patchsetId, 'reviews');

    const patchSha = await patch.commit();
    return { patchSha };
  }

  public async decide(args: {
    submissionId: string;
    decisionId: string;
    kind: 'merge' | 'close';
    rationale: string;
    mergeCommit?: string;
  }): Promise<{ patchSha: string }> {
    const graph = await this.graphHolder.getGraph();
    await graph.syncCoverage();
    await graph.materialize();

    const now = Date.now();
    const patch = await createPatchSession(graph);

    // Create decision node
    patch
      .addNode(args.decisionId)
      .setProperty(args.decisionId, 'type', 'decision')
      .setProperty(args.decisionId, 'kind', args.kind)
      .setProperty(args.decisionId, 'decided_by', this.agentId)
      .setProperty(args.decisionId, 'decided_at', now)
      .setProperty(args.decisionId, 'rationale', args.rationale);

    if (args.mergeCommit) {
      patch.setProperty(args.decisionId, 'merge_commit', args.mergeCommit);
    }

    // decides edge: decision → submission
    patch.addEdge(args.decisionId, args.submissionId, 'decides');

    const patchSha = await patch.commit();
    return { patchSha };
  }

  // =========================================================================
  // Read operations (SubmissionReadModel)
  // =========================================================================

  public async getQuestStatus(questId: string): Promise<QuestStatus | null> {
    const graph = await this.graphHolder.getGraph();
    await graph.syncCoverage();
    await graph.materialize();

    const props = await graph.getNodeProps(questId);
    if (!props) return null;
    const status = props.get('status');
    if (typeof status !== 'string' || !VALID_QUEST_STATUSES.has(status)) return null;
    return status as QuestStatus;
  }

  public async getSubmissionQuestId(submissionId: string): Promise<string | null> {
    const graph = await this.graphHolder.getGraph();
    await graph.syncCoverage();
    await graph.materialize();

    const props = await graph.getNodeProps(submissionId);
    if (!props) return null;
    const questId = props.get('quest_id');
    return typeof questId === 'string' ? questId : null;
  }

  public async getOpenSubmissionsForQuest(questId: string): Promise<string[]> {
    const graph = await this.graphHolder.getGraph();
    await graph.syncCoverage();
    await graph.materialize();

    // Traverse incoming 'submits' edges from the quest to find submissions
    const submissionNeighbors = toNeighborEntries(
      await graph.neighbors(questId, 'incoming', 'submits'),
    );

    const open: string[] = [];
    for (const n of submissionNeighbors) {
      const props = await graph.getNodeProps(n.nodeId);
      if (!props || props.get('type') !== 'submission') continue;

      // Check if this submission has a terminal decision (reuse already-materialized graph)
      const decisions = await this._getDecisionsFromGraph(graph, n.nodeId);
      const isTerminal = decisions.some((d) => d.kind === 'merge' || d.kind === 'close');
      if (!isTerminal) {
        open.push(n.nodeId);
      }
    }

    return open;
  }

  public async getPatchsetRefs(submissionId: string): Promise<PatchsetRef[]> {
    const graph = await this.graphHolder.getGraph();
    await graph.syncCoverage();
    await graph.materialize();

    // Traverse incoming 'has-patchset' edges from the submission to find patchsets
    const patchsetNeighbors = toNeighborEntries(
      await graph.neighbors(submissionId, 'incoming', 'has-patchset'),
    );

    const refs: PatchsetRef[] = [];
    for (const n of patchsetNeighbors) {
      const props = await graph.getNodeProps(n.nodeId);
      if (!props || props.get('type') !== 'patchset') continue;

      const authoredAt = props.get('authored_at');
      if (typeof authoredAt !== 'number') continue;

      // Find supersedes target via outgoing edge
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
    const graph = await this.graphHolder.getGraph();
    await graph.syncCoverage();
    await graph.materialize();

    const neighbors = toNeighborEntries(await graph.neighbors(patchsetId, 'outgoing'));
    for (const n of neighbors) {
      if (n.label === 'has-patchset' && n.nodeId.startsWith('submission:')) {
        return n.nodeId;
      }
    }
    return null;
  }

  public async getPatchsetWorkspaceRef(patchsetId: string): Promise<string | null> {
    const graph = await this.graphHolder.getGraph();
    await graph.syncCoverage();
    await graph.materialize();

    const props = await graph.getNodeProps(patchsetId);
    if (!props) return null;
    const workspaceRef = props.get('workspace_ref');
    return typeof workspaceRef === 'string' ? workspaceRef : null;
  }

  public async getReviewsForPatchset(patchsetId: string): Promise<ReviewRef[]> {
    const graph = await this.graphHolder.getGraph();
    await graph.syncCoverage();
    await graph.materialize();

    // Traverse incoming 'reviews' edges from the patchset to find review nodes
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
    const graph = await this.graphHolder.getGraph();
    await graph.syncCoverage();
    await graph.materialize();
    return this._getDecisionsFromGraph(graph, submissionId);
  }

  // =========================================================================
  // Internal helpers
  // =========================================================================

  private async _getDecisionsFromGraph(
    graph: WarpGraph,
    submissionId: string,
  ): Promise<DecisionProps[]> {
    // Traverse incoming 'decides' edges from the submission to find decision nodes
    const decisionNeighbors = toNeighborEntries(
      await graph.neighbors(submissionId, 'incoming', 'decides'),
    );

    const decisions: DecisionProps[] = [];
    for (const n of decisionNeighbors) {
      const props = await graph.getNodeProps(n.nodeId);
      // Type guard: 'decision:' prefix is shared with old concept/decision nodes;
      // the type === 'decision' check ensures we only pick submission decisions.
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
