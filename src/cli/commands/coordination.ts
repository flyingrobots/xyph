import type { Command } from 'commander';
import type { CliContext } from '../context.js';
import { createErrorHandler } from '../errorHandler.js';
import { assertPrefix } from '../validators.js';

export function registerCoordinationCommands(program: Command, ctx: CliContext): void {
  const withErrorHandler = createErrorHandler(ctx);

  program
    .command('claim <id>')
    .description('Volunteer for a Quest (Optimistic Claiming Protocol)')
    .action(withErrorHandler(async (id: string) => {
      assertPrefix(id, 'task:', 'Quest ID');
      const graph = await ctx.graphPort.getGraph();

      ctx.warn(`[*] Attempting to claim ${id} as ${ctx.agentId}...`);

      await graph.patch((p) => {
        p.setProperty(id, 'assigned_to', ctx.agentId)
          .setProperty(id, 'status', 'IN_PROGRESS')
          .setProperty(id, 'claimed_at', Date.now());
      });

      // Verify claim post-materialization (The OCP Verification Step)
      const props = await graph.getNodeProps(id);

      const confirmed = !!(props && props.get('assigned_to') === ctx.agentId);

      if (ctx.json) {
        if (!confirmed) {
          const winner = props ? String(props.get('assigned_to')) : 'unknown';
          ctx.fail(`Lost race condition for ${id}. Current owner: ${winner}`);
        }
        ctx.jsonOut({
          success: true, command: 'claim',
          data: { id, assignedTo: ctx.agentId, status: 'IN_PROGRESS' },
        });
        return;
      }

      if (confirmed) {
        ctx.ok(`[OK] Claim confirmed. ${id} is yours.`);
      } else {
        const winner = props ? props.get('assigned_to') : 'unknown';
        ctx.fail(`[FAIL] Lost race condition for ${id}. Current owner: ${String(winner)}`);
      }
    }));
}
