import type { Command } from 'commander';
import type { CliContext } from '../context.js';
import { createErrorHandler } from '../errorHandler.js';
import { VALID_TASK_KINDS } from '../../domain/entities/Quest.js';
import {
  VALID_REQUIREMENT_KINDS,
  VALID_REQUIREMENT_PRIORITIES,
} from '../../domain/entities/Requirement.js';
import { WarpRoadmapAdapter } from '../../infrastructure/adapters/WarpRoadmapAdapter.js';
import {
  AgentActionService,
  type AgentActionOutcome,
} from '../../domain/services/AgentActionService.js';
import { AgentContextService } from '../../domain/services/AgentContextService.js';
import type {
  AgentActionCandidate,
  AgentDependencyContext,
} from '../../domain/services/AgentRecommender.js';
import { AgentBriefingService } from '../../domain/services/AgentBriefingService.js';
import { AgentSubmissionService } from '../../domain/services/AgentSubmissionService.js';
import type { ReadinessAssessment } from '../../domain/services/ReadinessService.js';
import type { EntityDetail } from '../../domain/models/dashboard.js';

interface ActOptions {
  dryRun?: boolean;
  description?: string;
  title?: string;
  rationale?: string;
  artifact?: string;
  base?: string;
  workspace?: string;
  into?: string;
  patchset?: string;
  kind?: string;
  story?: string;
  storyTitle?: string;
  persona?: string;
  goal?: string;
  benefit?: string;
  requirement?: string;
  requirementDescription?: string;
  requirementKind?: string;
  priority?: string;
  criterion?: string;
  criterionDescription?: string;
  verifiable?: boolean;
  verdict?: string;
  message?: string;
  replyTo?: string;
  commentId?: string;
  related?: string[];
}

function buildActionArgs(opts: ActOptions): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  if (opts.description !== undefined) args['description'] = opts.description.trim();
  if (opts.title !== undefined) args['title'] = opts.title.trim();
  if (opts.rationale !== undefined) args['rationale'] = opts.rationale.trim();
  if (opts.artifact !== undefined) args['artifactHash'] = opts.artifact.trim();
  if (opts.base !== undefined) args['baseRef'] = opts.base.trim();
  if (opts.workspace !== undefined) args['workspaceRef'] = opts.workspace.trim();
  if (opts.into !== undefined) args['intoRef'] = opts.into.trim();
  if (opts.patchset !== undefined) args['patchsetId'] = opts.patchset.trim();
  if (opts.kind !== undefined) args['taskKind'] = opts.kind;
  if (opts.story !== undefined) args['storyId'] = opts.story;
  if (opts.storyTitle !== undefined) args['storyTitle'] = opts.storyTitle.trim();
  if (opts.persona !== undefined) args['persona'] = opts.persona.trim();
  if (opts.goal !== undefined) args['goal'] = opts.goal.trim();
  if (opts.benefit !== undefined) args['benefit'] = opts.benefit.trim();
  if (opts.requirement !== undefined) args['requirementId'] = opts.requirement;
  if (opts.requirementDescription !== undefined) {
    args['requirementDescription'] = opts.requirementDescription.trim();
  }
  if (opts.requirementKind !== undefined) args['requirementKind'] = opts.requirementKind;
  if (opts.priority !== undefined) args['priority'] = opts.priority;
  if (opts.criterion !== undefined) args['criterionId'] = opts.criterion;
  if (opts.criterionDescription !== undefined) {
    args['criterionDescription'] = opts.criterionDescription.trim();
  }
  if (opts.verifiable === false) args['verifiable'] = false;
  if (opts.verdict !== undefined) args['verdict'] = opts.verdict.trim();
  if (opts.message !== undefined) args['message'] = opts.message.trim();
  if (opts.replyTo !== undefined) args['replyTo'] = opts.replyTo;
  if (opts.commentId !== undefined) args['commentId'] = opts.commentId;
  if (opts.related !== undefined) {
    args['relatedIds'] = opts.related
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return args;
}

function renderHumanOutcome(
  ctx: CliContext,
  outcome: AgentActionOutcome,
): void {
  const label = outcome.result === 'dry-run' ? '[DRY RUN]' : '[OK]';
  ctx.ok(`${label} ${outcome.kind} ${outcome.targetId}`);
  ctx.muted(`  Command: ${outcome.underlyingCommand}`);
  for (const effect of outcome.sideEffects) {
    ctx.muted(`  Effect:  ${effect}`);
  }
  if (outcome.patch) {
    ctx.muted(`  Patch:   ${outcome.patch}`);
  }
  if (outcome.result === 'dry-run') {
    return;
  }

  const details = outcome.details ?? {};
  const detailKeys = Object.keys(details);
  if (detailKeys.length > 0) {
    ctx.print('');
    ctx.print('Result');
    for (const key of detailKeys.sort()) {
      ctx.print(`  ${key}: ${JSON.stringify(details[key])}`);
    }
  }
}

function renderAgentContext(
  detail: EntityDetail,
  readiness: ReadinessAssessment | null,
  dependency: AgentDependencyContext | null,
  recommendedActions: AgentActionCandidate[],
): string {
  const lines: string[] = [];
  lines.push(`${detail.id}  [${detail.type}]`);

  if (detail.questDetail) {
    const quest = detail.questDetail.quest;
    lines.push(`${quest.title}  [${quest.status}]`);
    lines.push(`kind: ${quest.taskKind ?? 'delivery'}   hours: ${quest.hours}`);
    if (quest.description) {
      lines.push('');
      lines.push(quest.description);
    }

    lines.push('');
    lines.push('Action Context');
    lines.push(`  campaign: ${detail.questDetail.campaign?.id ?? '—'}`);
    lines.push(`  intent: ${detail.questDetail.intent?.id ?? '—'}`);
    lines.push(`  assigned: ${quest.assignedTo ?? '—'}`);
    if (readiness) {
      lines.push(`  readiness: ${readiness.valid ? 'valid' : 'blocked'}`);
      for (const unmet of readiness.unmet) {
        lines.push(`    - ${unmet.message}`);
      }
    }
    if (dependency) {
      lines.push(`  executable: ${dependency.isExecutable ? 'yes' : 'no'}`);
      lines.push(`  frontier: ${dependency.isFrontier ? 'yes' : 'no'}`);
      lines.push(`  topoIndex: ${dependency.topologicalIndex ?? '—'}`);
      lines.push(`  downstream: ${dependency.transitiveDownstream}`);
      if (dependency.dependsOn.length > 0) {
        lines.push(`  dependsOn: ${dependency.dependsOn.map((entry) => entry.id).join(', ')}`);
      }
      if (dependency.blockedBy.length > 0) {
        lines.push(`  blockedBy: ${dependency.blockedBy.map((entry) => entry.id).join(', ')}`);
      }
      if (dependency.dependents.length > 0) {
        lines.push(`  dependents: ${dependency.dependents.map((entry) => entry.id).join(', ')}`);
      }
    }

    if (detail.questDetail.submission) {
      lines.push('');
      lines.push('Submission');
      lines.push(`  latest: ${detail.questDetail.submission.id} (${detail.questDetail.submission.status})`);
      lines.push(`  reviews: ${detail.questDetail.reviews.length}`);
      lines.push(`  decisions: ${detail.questDetail.decisions.length}`);
    }

    lines.push('');
    lines.push('Recommended Actions');
    if (recommendedActions.length === 0) {
      lines.push('  none');
    } else {
      for (const action of recommendedActions) {
        const status = action.allowed ? 'allowed' : 'blocked';
        lines.push(`  - ${action.kind} (${status})`);
        lines.push(`      ${action.reason}`);
        if (action.blockedBy.length > 0) {
          lines.push(`      blockedBy: ${action.blockedBy.join(' | ')}`);
        }
      }
    }

    return lines.join('\n');
  }

  const propKeys = Object.keys(detail.props).sort();
  if (propKeys.length > 0) {
    lines.push('');
    lines.push('Properties');
    for (const key of propKeys) {
      lines.push(`  ${key}: ${JSON.stringify(detail.props[key])}`);
    }
  }
  return lines.join('\n');
}

function renderBriefing(briefing: {
  identity: { agentId: string; principalType: string };
  assignments: { quest: { id: string; title: string; status: string }; nextAction: AgentActionCandidate | null }[];
  reviewQueue: {
    submissionId: string;
    questTitle: string;
    status: string;
    nextStep: { kind: string; targetId: string };
  }[];
  frontier: { quest: { id: string; title: string; status: string }; nextAction: AgentActionCandidate | null }[];
  recentHandoffs: { noteId: string; title: string; authoredAt: number; relatedIds: string[] }[];
  alerts: { severity: string; message: string }[];
  graphMeta: { maxTick: number; writerCount: number; tipSha: string } | null;
}): string {
  const lines: string[] = [];
  lines.push(`${briefing.identity.agentId}  [${briefing.identity.principalType}]`);

  lines.push('');
  lines.push(`Assignments (${briefing.assignments.length})`);
  if (briefing.assignments.length === 0) {
    lines.push('  none');
  } else {
    for (const entry of briefing.assignments) {
      lines.push(`  - ${entry.quest.id} ${entry.quest.title} [${entry.quest.status}]`);
      if (entry.nextAction) {
        lines.push(`      next: ${entry.nextAction.kind}`);
      }
    }
  }

  lines.push('');
  lines.push(`Review Queue (${briefing.reviewQueue.length})`);
  if (briefing.reviewQueue.length === 0) {
    lines.push('  none');
  } else {
    for (const entry of briefing.reviewQueue) {
      lines.push(`  - ${entry.submissionId} ${entry.questTitle} [${entry.status}]`);
      lines.push(`      next: ${entry.nextStep.kind} ${entry.nextStep.targetId}`);
    }
  }

  lines.push('');
  lines.push(`Frontier (${briefing.frontier.length})`);
  if (briefing.frontier.length === 0) {
    lines.push('  none');
  } else {
    for (const entry of briefing.frontier) {
      lines.push(`  - ${entry.quest.id} ${entry.quest.title} [${entry.quest.status}]`);
      if (entry.nextAction) {
        lines.push(`      next: ${entry.nextAction.kind}`);
      }
    }
  }

  lines.push('');
  lines.push(`Recent Handoffs (${briefing.recentHandoffs.length})`);
  if (briefing.recentHandoffs.length === 0) {
    lines.push('  none');
  } else {
    for (const entry of briefing.recentHandoffs) {
      lines.push(`  - ${entry.noteId} ${entry.title}`);
      lines.push(`      at: ${new Date(entry.authoredAt).toISOString()}`);
      if (entry.relatedIds.length > 0) {
        lines.push(`      related: ${entry.relatedIds.join(', ')}`);
      }
    }
  }

  if (briefing.alerts.length > 0) {
    lines.push('');
    lines.push('Alerts');
    for (const alert of briefing.alerts) {
      lines.push(`  - ${alert.severity}: ${alert.message}`);
    }
  }

  if (briefing.graphMeta) {
    lines.push('');
    lines.push(`Graph: tick=${briefing.graphMeta.maxTick} writers=${briefing.graphMeta.writerCount} tip=${briefing.graphMeta.tipSha}`);
  }

  return lines.join('\n');
}

function renderNext(candidates: {
  kind: string;
  targetId: string;
  questTitle: string;
  source: string;
  reason: string;
  blockedBy: string[];
}[]): string {
  const lines: string[] = [];
  lines.push(`Candidates (${candidates.length})`);
  if (candidates.length === 0) {
    lines.push('  none');
    return lines.join('\n');
  }

  for (const candidate of candidates) {
    lines.push(`  - ${candidate.kind} ${candidate.targetId} [${candidate.source}]`);
    lines.push(`      ${candidate.questTitle}`);
    lines.push(`      ${candidate.reason}`);
    if (candidate.blockedBy.length > 0) {
      lines.push(`      blockedBy: ${candidate.blockedBy.join(' | ')}`);
    }
  }
  return lines.join('\n');
}

function renderSubmissions(queues: {
  counts: { owned: number; reviewable: number; attentionNeeded: number; stale: number };
  staleAfterHours: number;
  owned: {
    submissionId: string;
    questTitle: string;
    status: string;
    nextStep: { kind: string; targetId: string };
    attentionCodes: string[];
  }[];
  reviewable: {
    submissionId: string;
    questTitle: string;
    status: string;
    nextStep: { kind: string; targetId: string };
    attentionCodes: string[];
  }[];
  attentionNeeded: {
    submissionId: string;
    questTitle: string;
    status: string;
    nextStep: { kind: string; targetId: string };
    attentionCodes: string[];
  }[];
}): string {
  const renderSection = (
    title: string,
    entries: {
      submissionId: string;
      questTitle: string;
      status: string;
      nextStep: { kind: string; targetId: string };
      attentionCodes: string[];
    }[],
  ): string[] => {
    const lines: string[] = [];
    lines.push(title);
    if (entries.length === 0) {
      lines.push('  none');
      return lines;
    }
    for (const entry of entries) {
      lines.push(`  - ${entry.submissionId} ${entry.questTitle} [${entry.status}]`);
      lines.push(`      next: ${entry.nextStep.kind} ${entry.nextStep.targetId}`);
      if (entry.attentionCodes.length > 0) {
        lines.push(`      flags: ${entry.attentionCodes.join(' | ')}`);
      }
    }
    return lines;
  };

  const lines: string[] = [];
  lines.push(`Submissions owned=${queues.counts.owned} reviewable=${queues.counts.reviewable} attention=${queues.counts.attentionNeeded} stale=${queues.counts.stale}`);
  lines.push(`Stale threshold: ${queues.staleAfterHours}h`);
  lines.push('');
  lines.push(...renderSection('Owned', queues.owned));
  lines.push('');
  lines.push(...renderSection('Reviewable', queues.reviewable));
  lines.push('');
  lines.push(...renderSection('Attention Needed', queues.attentionNeeded));
  return lines.join('\n');
}

export function registerAgentCommands(program: Command, ctx: CliContext): void {
  const withErrorHandler = createErrorHandler(ctx);

  program
    .command('briefing')
    .description('Build a start-of-session agent briefing packet')
    .action(withErrorHandler(async () => {
      const service = new AgentBriefingService(
        ctx.graphPort,
        new WarpRoadmapAdapter(ctx.graphPort),
        ctx.agentId,
      );
      const briefing = await service.buildBriefing();

      if (ctx.json) {
        ctx.jsonOut({
          success: true,
          command: 'briefing',
          data: { ...briefing },
        });
        return;
      }

      ctx.print(renderBriefing(briefing));
    }));

  program
    .command('next')
    .description('Recommend the next validated actions for this agent')
    .option('--limit <n>', 'Maximum number of action candidates to return', '5')
    .action(withErrorHandler(async (opts: { limit: string }) => {
      const limit = Number.parseInt(opts.limit, 10);
      if (!Number.isFinite(limit) || limit < 1) {
        throw new Error(`[INVALID_ARGS] --limit must be a positive integer, got '${opts.limit}'`);
      }

      const service = new AgentBriefingService(
        ctx.graphPort,
        new WarpRoadmapAdapter(ctx.graphPort),
        ctx.agentId,
      );
      const candidates = await service.next(limit);

      if (ctx.json) {
        ctx.jsonOut({
          success: true,
          command: 'next',
          data: {
            candidates,
          },
        });
        return;
      }

      ctx.print(renderNext(candidates));
    }));

  program
    .command('submissions')
    .description('Build the agent-facing submission queues')
    .option('--limit <n>', 'Maximum number of entries to return per queue', '10')
    .action(withErrorHandler(async (opts: { limit: string }) => {
      const limit = Number.parseInt(opts.limit, 10);
      if (!Number.isFinite(limit) || limit < 1) {
        throw new Error(`[INVALID_ARGS] --limit must be a positive integer, got '${opts.limit}'`);
      }

      const service = new AgentSubmissionService(ctx.graphPort, ctx.agentId);
      const queues = await service.list(limit);

      if (ctx.json) {
        ctx.jsonOut({
          success: true,
          command: 'submissions',
          data: { ...queues },
        });
        return;
      }

      ctx.print(renderSubmissions(queues));
    }));

  program
    .command('context <id>')
    .description('Build an action-oriented work packet for an entity')
    .action(withErrorHandler(async (id: string) => {
      const service = new AgentContextService(
        ctx.graphPort,
        new WarpRoadmapAdapter(ctx.graphPort),
        ctx.agentId,
      );
      const result = await service.fetch(id);
      if (!result) {
        if (ctx.json) {
          return ctx.failWithData(`Node ${id} not found in the graph`, { id });
        }
        return ctx.fail(`[NOT_FOUND] Node ${id} not found in the graph`);
      }

      if (ctx.json) {
        ctx.jsonOut({
          success: true,
          command: 'context',
          data: {
            id: result.detail.id,
            type: result.detail.type,
            props: result.detail.props,
            content: result.detail.content ?? null,
            contentOid: result.detail.contentOid ?? null,
            outgoing: result.detail.outgoing,
            incoming: result.detail.incoming,
            questDetail: result.detail.questDetail ?? null,
            agentContext: {
              readiness: result.readiness,
              dependency: result.dependency,
              recommendedActions: result.recommendedActions,
            },
          },
        });
        return;
      }

      ctx.print(renderAgentContext(
        result.detail,
        result.readiness,
        result.dependency,
        result.recommendedActions,
      ));
    }));

  program
    .command('act <actionKind> <targetId>')
    .description('Execute a validated routine action through the agent action kernel')
    .option('--dry-run', 'Validate and normalize without mutating graph or workspace')
    .option('--description <text>', 'Description for shape or submit')
    .option('--title <text>', 'Title for handoff')
    .option('--rationale <text>', 'Rationale for seal or merge')
    .option('--artifact <hash>', 'Artifact hash for seal')
    .option('--base <ref>', 'Base branch for submit (default: main)')
    .option('--workspace <ref>', 'Workspace ref for submit (default: current git branch)')
    .option('--into <ref>', 'Target branch for merge (default: main)')
    .option('--patchset <id>', 'Explicit patchset ID for merge')
    .option('--kind <kind>', `Quest kind for shape (${[...VALID_TASK_KINDS].join(' | ')})`)
    .option('--story <id>', 'Story node ID for packet')
    .option('--story-title <text>', 'Story title for packet')
    .option('--persona <text>', 'Story persona for packet')
    .option('--goal <text>', 'Story goal for packet')
    .option('--benefit <text>', 'Story benefit for packet')
    .option('--requirement <id>', 'Requirement node ID for packet')
    .option('--requirement-description <text>', 'Requirement description for packet')
    .option('--requirement-kind <kind>', `Requirement kind (${[...VALID_REQUIREMENT_KINDS].join(' | ')})`)
    .option('--priority <level>', `Requirement priority (${[...VALID_REQUIREMENT_PRIORITIES].join(' | ')})`)
    .option('--criterion <id>', 'Criterion node ID for packet')
    .option('--criterion-description <text>', 'Criterion description for packet')
    .option('--no-verifiable', 'Mark a newly created criterion as not independently verifiable')
    .option('--verdict <type>', 'Review verdict for review (approve | request-changes | comment)')
    .option('--message <text>', 'Comment body for comment or review')
    .option('--reply-to <commentId>', 'Reply target for comment')
    .option('--comment-id <id>', 'Explicit comment ID for comment')
    .option('--related <ids...>', 'Additional related IDs for handoff')
    .action(withErrorHandler(async (actionKind: string, targetId: string, opts: ActOptions) => {
      const service = new AgentActionService(
        ctx.graphPort,
        new WarpRoadmapAdapter(ctx.graphPort),
        ctx.agentId,
      );

      const outcome = await service.execute({
        kind: actionKind,
        targetId,
        dryRun: opts.dryRun ?? false,
        args: buildActionArgs(opts),
      });

      if (outcome.result === 'rejected') {
        const reason = outcome.validation.reasons[0] ?? `Action '${actionKind}' was rejected`;
        if (ctx.json) {
          return ctx.failWithData(reason, { ...outcome });
        }
        return ctx.fail(`[REJECTED] ${reason}`);
      }

      if (ctx.json) {
        ctx.jsonOut({
          success: true,
          command: 'act',
          data: { ...outcome },
        });
        return;
      }

      renderHumanOutcome(ctx, outcome);
    }));

  program
    .command('handoff <targetId>')
    .description('Record a durable graph-native session handoff note')
    .requiredOption('--message <text>', 'Handoff summary body')
    .option('--title <text>', 'Optional handoff title')
    .option('--related <ids...>', 'Additional related IDs to document with the handoff')
    .action(withErrorHandler(async (targetId: string, opts: Pick<ActOptions, 'message' | 'title' | 'related'>) => {
      const service = new AgentActionService(
        ctx.graphPort,
        new WarpRoadmapAdapter(ctx.graphPort),
        ctx.agentId,
      );

      const outcome = await service.execute({
        kind: 'handoff',
        targetId,
        dryRun: false,
        args: buildActionArgs(opts),
      });

      if (outcome.result === 'rejected') {
        const reason = outcome.validation.reasons[0] ?? `Action 'handoff' was rejected`;
        if (ctx.json) {
          return ctx.failWithData(reason, { ...outcome });
        }
        return ctx.fail(`[REJECTED] ${reason}`);
      }

      const details = outcome.details ?? {};
      if (ctx.json) {
        ctx.jsonOut({
          success: true,
          command: 'handoff',
          data: {
            noteId: details['noteId'] ?? null,
            authoredBy: details['authoredBy'] ?? null,
            authoredAt: details['authoredAt'] ?? null,
            relatedIds: details['relatedIds'] ?? [targetId],
            patch: outcome.patch,
            title: details['title'] ?? null,
            contentOid: details['contentOid'] ?? null,
          },
        });
        return;
      }

      ctx.ok(`[OK] handoff ${targetId}`);
      ctx.muted(`  Note:    ${String(details['noteId'] ?? 'unknown')}`);
      ctx.muted(`  Patch:   ${String(outcome.patch ?? 'none')}`);
      const relatedIds = Array.isArray(details['relatedIds']) ? details['relatedIds'] : [targetId];
      ctx.muted(`  Related: ${relatedIds.join(', ')}`);
    }));
}
