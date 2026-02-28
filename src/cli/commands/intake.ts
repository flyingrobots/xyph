import type { Command } from 'commander';
import type { CliContext } from '../context.js';
import { withErrorHandler } from '../errorHandler.js';
import { assertPrefix, assertMinLength, assertPrefixOneOf, parseHours } from '../validators.js';

export function registerIntakeCommands(program: Command, ctx: CliContext): void {
  program
    .command('inbox <id>')
    .description('Suggest a task for triage — adds to INBOX with provenance tracking')
    .requiredOption('--title <text>', 'Task description')
    .requiredOption('--suggested-by <principal>', 'Who is suggesting this task (human.* or agent.*)')
    .option('--hours <number>', 'Estimated hours', parseHours)
    .action(withErrorHandler(async (id: string, opts: { title: string; suggestedBy: string; hours?: number }) => {
      assertPrefix(id, 'task:', 'Task ID');
      assertMinLength(opts.title, 5, '--title');
      assertPrefixOneOf(opts.suggestedBy, ['human.', 'agent.'], '--suggested-by');

      const graph = await ctx.graphPort.getGraph();
      const now = Date.now();

      const sha = await graph.patch((p) => {
        p.addNode(id)
          .setProperty(id, 'title', opts.title)
          .setProperty(id, 'status', 'INBOX')
          .setProperty(id, 'hours', opts.hours ?? 0)
          .setProperty(id, 'type', 'task')
          .setProperty(id, 'suggested_by', opts.suggestedBy)
          .setProperty(id, 'suggested_at', now);
      });

      ctx.ok(`[OK] Task ${id} added to INBOX.`);
      ctx.muted(`  Suggested by: ${opts.suggestedBy}`);
      ctx.muted(`  Patch: ${sha}`);
    }));

  program
    .command('promote <id>')
    .description('Promote an INBOX task to BACKLOG — human authority + sovereign intent required')
    .requiredOption('--intent <id>', 'Sovereign Intent ID (intent:* prefix)')
    .option('--campaign <id>', 'Campaign to assign (optional, assignable later)')
    .action(withErrorHandler(async (id: string, opts: { intent: string; campaign?: string }) => {
      const { WarpIntakeAdapter } = await import('../../infrastructure/adapters/WarpIntakeAdapter.js');

      const intake = new WarpIntakeAdapter(ctx.graphPort, ctx.agentId);
      const sha = await intake.promote(id, opts.intent, opts.campaign);

      ctx.ok(`[OK] Task ${id} promoted to BACKLOG.`);
      ctx.muted(`  Intent:   ${opts.intent}`);
      if (opts.campaign !== undefined) ctx.muted(`  Campaign: ${opts.campaign}`);
      ctx.muted(`  Patch: ${sha}`);
    }));

  program
    .command('reject <id>')
    .description('Reject an INBOX task to GRAVEYARD — rationale required')
    .requiredOption('--rationale <text>', 'Reason for rejection (non-empty)')
    .action(withErrorHandler(async (id: string, opts: { rationale: string }) => {
      const { WarpIntakeAdapter } = await import('../../infrastructure/adapters/WarpIntakeAdapter.js');

      const intake = new WarpIntakeAdapter(ctx.graphPort, ctx.agentId);
      const sha = await intake.reject(id, opts.rationale);

      ctx.ok(`[OK] Task ${id} moved to GRAVEYARD.`);
      ctx.muted(`  Rejected by: ${ctx.agentId}`);
      ctx.muted(`  Rationale:   ${opts.rationale}`);
      ctx.muted(`  Patch: ${sha}`);
    }));

  program
    .command('reopen <id>')
    .description('Reopen a GRAVEYARD task back to INBOX — human authority required, history preserved')
    .action(withErrorHandler(async (id: string) => {
      const { WarpIntakeAdapter } = await import('../../infrastructure/adapters/WarpIntakeAdapter.js');

      const intake = new WarpIntakeAdapter(ctx.graphPort, ctx.agentId);
      const sha = await intake.reopen(id);

      ctx.ok(`[OK] Task ${id} reopened to INBOX.`);
      ctx.muted(`  Reopened by: ${ctx.agentId}`);
      ctx.muted(`  Note: rejection history preserved in graph.`);
      ctx.muted(`  Patch: ${sha}`);
    }));
}
