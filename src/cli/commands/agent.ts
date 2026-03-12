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

interface ActOptions {
  dryRun?: boolean;
  description?: string;
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
  message?: string;
  replyTo?: string;
  commentId?: string;
}

function buildActionArgs(opts: ActOptions): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  if (opts.description !== undefined) args['description'] = opts.description.trim();
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
  if (opts.message !== undefined) args['message'] = opts.message.trim();
  if (opts.replyTo !== undefined) args['replyTo'] = opts.replyTo;
  if (opts.commentId !== undefined) args['commentId'] = opts.commentId;
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

export function registerAgentCommands(program: Command, ctx: CliContext): void {
  const withErrorHandler = createErrorHandler(ctx);

  program
    .command('act <actionKind> <targetId>')
    .description('Execute a validated routine action through the agent action kernel')
    .option('--dry-run', 'Validate and normalize without mutating graph or workspace')
    .option('--description <text>', 'Quest description for shape')
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
    .option('--message <text>', 'Comment body for comment')
    .option('--reply-to <commentId>', 'Reply target for comment')
    .option('--comment-id <id>', 'Explicit comment ID for comment')
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
}
