import type { Command } from 'commander';
import type { CliContext } from '../context.js';
import { createErrorHandler } from '../errorHandler.js';
import { assertPrefix, assertMinLength, assertPrefixOneOf, parseHours } from '../validators.js';
import { VALID_TASK_KINDS, type QuestKind } from '../../domain/entities/Quest.js';

function resolveTaskKind(raw: string | undefined): QuestKind {
  const taskKind = raw ?? 'delivery';
  if (!VALID_TASK_KINDS.has(taskKind)) {
    throw new Error(`--kind must be one of ${[...VALID_TASK_KINDS].join(', ')}`);
  }
  return taskKind as QuestKind;
}

export function registerIntakeCommands(program: Command, ctx: CliContext): void {
  const withErrorHandler = createErrorHandler(ctx);

  program
    .command('inbox <id>')
    .description('Suggest a task for triage — adds to BACKLOG with provenance tracking')
    .requiredOption('--title <text>', 'Task description')
    .requiredOption('--suggested-by <principal>', 'Who is suggesting this task (human.* or agent.*)')
    .option('--description <text>', 'Durable quest description/body preview')
    .option('--kind <kind>', `Quest kind (${[...VALID_TASK_KINDS].join(' | ')})`)
    .option('--hours <number>', 'Estimated hours', parseHours)
    .action(withErrorHandler(async (id: string, opts: { title: string; suggestedBy: string; description?: string; kind?: string; hours?: number }) => {
      assertPrefix(id, 'task:', 'Task ID');
      assertMinLength(opts.title, 5, '--title');
      assertPrefixOneOf(opts.suggestedBy, ['human.', 'agent.'], '--suggested-by');
      if (opts.description !== undefined) assertMinLength(opts.description.trim(), 5, '--description');
      const taskKind = resolveTaskKind(opts.kind);

      const graph = await ctx.graphPort.getGraph();
      const now = Date.now();

      const sha = await graph.patch((p) => {
        p.addNode(id)
          .setProperty(id, 'title', opts.title)
          .setProperty(id, 'status', 'BACKLOG')
          .setProperty(id, 'hours', opts.hours ?? 0)
          .setProperty(id, 'type', 'task')
          .setProperty(id, 'task_kind', taskKind)
          .setProperty(id, 'suggested_by', opts.suggestedBy)
          .setProperty(id, 'suggested_at', now);
        if (opts.description !== undefined) {
          p.setProperty(id, 'description', opts.description.trim());
        }
      });

      if (ctx.json) {
        ctx.jsonOut({
          success: true, command: 'inbox',
          data: {
            id,
            title: opts.title,
            status: 'BACKLOG',
            suggestedBy: opts.suggestedBy,
            description: opts.description?.trim() ?? null,
            taskKind,
            hours: opts.hours ?? 0,
            patch: sha,
          },
        });
        return;
      }

      ctx.ok(`[OK] Task ${id} added to BACKLOG.`);
      ctx.muted(`  Suggested by: ${opts.suggestedBy}`);
      ctx.muted(`  Patch: ${sha}`);
    }));

  program
    .command('promote <id>')
    .description('Promote a BACKLOG task to PLANNED — human authority, sovereign intent, and spec metadata required')
    .requiredOption('--intent <id>', 'Sovereign Intent ID (intent:* prefix)')
    .option('--campaign <id>', 'Campaign to assign (optional, assignable later)')
    .option('--description <text>', 'Durable quest description/body preview')
    .option('--kind <kind>', `Quest kind (${[...VALID_TASK_KINDS].join(' | ')})`)
    .action(withErrorHandler(async (id: string, opts: { intent: string; campaign?: string; description?: string; kind?: string }) => {
      const { WarpIntakeAdapter } = await import('../../infrastructure/adapters/WarpIntakeAdapter.js');
      if (opts.description !== undefined) assertMinLength(opts.description.trim(), 5, '--description');
      const taskKind = resolveTaskKind(opts.kind);

      const intake = new WarpIntakeAdapter(ctx.graphPort, ctx.agentId);
      const sha = await intake.promote(id, opts.intent, opts.campaign, {
        description: opts.description?.trim(),
        taskKind,
      });

      if (ctx.json) {
        ctx.jsonOut({
          success: true, command: 'promote',
          data: {
            id,
            intent: opts.intent,
            campaign: opts.campaign ?? null,
            description: opts.description?.trim() ?? null,
            taskKind,
            patch: sha,
          },
        });
        return;
      }

      ctx.ok(`[OK] Task ${id} promoted to PLANNED.`);
      ctx.muted(`  Intent:   ${opts.intent}`);
      if (opts.campaign !== undefined) ctx.muted(`  Campaign: ${opts.campaign}`);
      ctx.muted(`  Patch: ${sha}`);
    }));

  program
    .command('ready <id>')
    .description('Validate a PLANNED task and move it into the executable DAG')
    .action(withErrorHandler(async (id: string) => {
      const { WarpIntakeAdapter } = await import('../../infrastructure/adapters/WarpIntakeAdapter.js');
      const { WarpRoadmapAdapter } = await import('../../infrastructure/adapters/WarpRoadmapAdapter.js');
      const { ReadinessService } = await import('../../domain/services/ReadinessService.js');

      const readiness = new ReadinessService(new WarpRoadmapAdapter(ctx.graphPort));
      const assessment = await readiness.assess(id);
      if (!assessment.valid) {
        if (ctx.json) {
          ctx.failWithData(`[NOT_READY] ${id} does not satisfy readiness requirements`, {
            valid: false,
            id,
            status: assessment.status ?? null,
            taskKind: assessment.taskKind ?? null,
            intentId: assessment.intentId ?? null,
            campaignId: assessment.campaignId ?? null,
            unmet: assessment.unmet,
          });
        }
        ctx.fail(`[NOT_READY] ${assessment.unmet.map((item) => item.message).join('\n  - ')}`);
      }

      const intake = new WarpIntakeAdapter(ctx.graphPort, ctx.agentId);
      const sha = await intake.ready(id);
      const graph = await ctx.graphPort.getGraph();
      const props = await graph.getNodeProps(id);
      const readyAt = typeof props?.['ready_at'] === 'number' ? props['ready_at'] : null;

      if (ctx.json) {
        ctx.jsonOut({
          success: true,
          command: 'ready',
          data: {
            id,
            status: 'READY',
            taskKind: assessment.taskKind ?? 'delivery',
            intentId: assessment.intentId ?? null,
            campaignId: assessment.campaignId ?? null,
            readyBy: ctx.agentId,
            readyAt,
            patch: sha,
          },
        });
        return;
      }

      ctx.ok(`[OK] Task ${id} moved to READY.`);
      ctx.muted(`  Ready by: ${ctx.agentId}`);
      ctx.muted(`  Patch:    ${sha}`);
    }));

  program
    .command('reject <id>')
    .description('Reject a BACKLOG or PLANNED task to GRAVEYARD — rationale required')
    .requiredOption('--rationale <text>', 'Reason for rejection (non-empty)')
    .action(withErrorHandler(async (id: string, opts: { rationale: string }) => {
      const { WarpIntakeAdapter } = await import('../../infrastructure/adapters/WarpIntakeAdapter.js');

      const intake = new WarpIntakeAdapter(ctx.graphPort, ctx.agentId);
      const sha = await intake.reject(id, opts.rationale);

      if (ctx.json) {
        ctx.jsonOut({
          success: true, command: 'reject',
          data: { id, rejectedBy: ctx.agentId, rationale: opts.rationale, patch: sha },
        });
        return;
      }

      ctx.ok(`[OK] Task ${id} moved to GRAVEYARD.`);
      ctx.muted(`  Rejected by: ${ctx.agentId}`);
      ctx.muted(`  Rationale:   ${opts.rationale}`);
      ctx.muted(`  Patch: ${sha}`);
    }));

  program
    .command('reopen <id>')
    .description('Reopen a GRAVEYARD task back to BACKLOG — human authority required, history preserved')
    .action(withErrorHandler(async (id: string) => {
      const { WarpIntakeAdapter } = await import('../../infrastructure/adapters/WarpIntakeAdapter.js');

      const intake = new WarpIntakeAdapter(ctx.graphPort, ctx.agentId);
      const sha = await intake.reopen(id);

      if (ctx.json) {
        ctx.jsonOut({
          success: true, command: 'reopen',
          data: { id, reopenedBy: ctx.agentId, patch: sha },
        });
        return;
      }

      ctx.ok(`[OK] Task ${id} reopened to BACKLOG.`);
      ctx.muted(`  Reopened by: ${ctx.agentId}`);
      ctx.muted(`  Note: rejection history preserved in graph.`);
      ctx.muted(`  Patch: ${sha}`);
    }));
}
