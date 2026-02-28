import type { Command } from 'commander';
import type { CliContext } from '../context.js';
import { createErrorHandler } from '../errorHandler.js';

export function registerCoordinationCommands(program: Command, ctx: CliContext): void {
  const withErrorHandler = createErrorHandler(ctx);

  program
    .command('claim <id>')
    .description('Volunteer for a Quest (Optimistic Claiming Protocol)')
    .action(withErrorHandler(async (id: string) => {
      const graph = await ctx.graphPort.getGraph();

      ctx.warn(`[*] Attempting to claim ${id} as ${ctx.agentId}...`);

      await graph.patch((p) => {
        p.setProperty(id, 'assigned_to', ctx.agentId)
          .setProperty(id, 'status', 'IN_PROGRESS')
          .setProperty(id, 'claimed_at', Date.now());
      });

      // Verify claim post-materialization (The OCP Verification Step)
      const props = await graph.getNodeProps(id);

      if (props && props.get('assigned_to') === ctx.agentId) {
        ctx.ok(`[OK] Claim confirmed. ${id} is yours.`);
      } else {
        const winner = props ? props.get('assigned_to') : 'unknown';
        ctx.fail(`[FAIL] Lost race condition for ${id}. Current owner: ${String(winner)}`);
      }
    }));
}
