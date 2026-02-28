import type { Command } from 'commander';
import type { CliContext } from '../context.js';
import { withErrorHandler } from '../errorHandler.js';
import { assertPrefix, assertMinLength } from '../validators.js';

export function registerSovereigntyCommands(program: Command, ctx: CliContext): void {
  program
    .command('intent <id>')
    .description('Declare a sovereign human Intent — the causal root of all Quests')
    .requiredOption('--title <text>', 'Statement of human desire (what and why)')
    .requiredOption('--requested-by <principal>', 'Human principal ID (must start with human.)')
    .option('--description <text>', 'Longer-form description of the intent')
    .action(withErrorHandler(async (id: string, opts: { title: string; requestedBy: string; description?: string }) => {
      assertPrefix(id, 'intent:', 'Intent ID');
      assertPrefix(opts.requestedBy, 'human.', '--requested-by');
      assertMinLength(opts.title, 5, '--title');

      const graph = await ctx.graphPort.getGraph();
      const now = Date.now();

      const sha = await graph.patch((p) => {
        p.addNode(id)
          .setProperty(id, 'title', opts.title)
          .setProperty(id, 'requested_by', opts.requestedBy)
          .setProperty(id, 'created_at', now)
          .setProperty(id, 'type', 'intent');

        if (opts.description) {
          p.setProperty(id, 'description', opts.description);
        }
      });

      ctx.ok(`[OK] Intent ${id} declared by ${opts.requestedBy}. Patch: ${sha}`);
      ctx.muted(`  Title: ${opts.title}`);
    }));
}
