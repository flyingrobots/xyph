import type { Command } from 'commander';
import type { CliContext } from '../context.js';
import { createErrorHandler } from '../errorHandler.js';
import { assertPrefix, parseHours } from '../validators.js';

export function registerIngestCommands(program: Command, ctx: CliContext): void {
  const withErrorHandler = createErrorHandler(ctx);

  program
    .command('quest <id>')
    .description('Initialize a new Quest node')
    .requiredOption('--title <text>', 'Quest title')
    .requiredOption('--campaign <id>', 'Parent Campaign ID (use "none" to skip)')
    .option('--hours <number>', 'Estimated human hours (PERT)', parseHours)
    .option('--intent <id>', 'Sovereign Intent node that authorizes this Quest (intent:* prefix)')
    .action(withErrorHandler(async (id: string, opts: { title: string; campaign: string; hours?: number; intent?: string }) => {
      assertPrefix(id, 'task:', 'Quest ID');

      const intentId = opts.intent;
      if (!intentId) {
        return ctx.fail(
          `[CONSTITUTION VIOLATION] Quest ${id} requires --intent <id> (Art. IV — Genealogy of Intent).\n` +
          `  Every Quest must trace its lineage to a sovereign human Intent.\n` +
          `  Declare one first: xyph-actuator intent <id> --title "..." --requested-by human.<name>`,
        );
      }
      assertPrefix(intentId, 'intent:', '--intent value');

      const graph = await ctx.graphPort.getGraph();
      const sha = await graph.patch((p) => {
        p.addNode(id)
          .setProperty(id, 'title', opts.title)
          .setProperty(id, 'status', 'BACKLOG')
          .setProperty(id, 'hours', opts.hours ?? 0)
          .setProperty(id, 'type', 'task');

        if (opts.campaign !== 'none') {
          p.addEdge(id, opts.campaign, 'belongs-to');
        }
        p.addEdge(id, intentId, 'authorized-by');
      });

      if (ctx.json) {
        ctx.jsonOut({
          success: true, command: 'quest',
          data: { id, title: opts.title, status: 'BACKLOG', campaign: opts.campaign, intent: intentId, hours: opts.hours ?? 0, patch: sha },
        });
        return;
      }

      const campaignNote = opts.campaign === 'none' ? '(no campaign)' : `in campaign ${opts.campaign}`;
      ctx.ok(`[OK] Quest ${id} initialized ${campaignNote}. Patch: ${sha}`);
    }));
}
