import type { Command } from 'commander';
import type { CliContext } from '../context.js';
import { createErrorHandler } from '../errorHandler.js';
import { assertPrefix, assertNodeExists } from '../validators.js';
export function registerCoordinationCommands(program: Command, ctx: CliContext): void {
  const withErrorHandler = createErrorHandler(ctx);

  program
    .command('claim <id>')
    .description('Volunteer for a Quest (Optimistic Claiming Protocol)')
    .action(withErrorHandler(async (id: string) => {
      assertPrefix(id, 'task:', 'Quest ID');
      const graph = await ctx.graphPort.getGraph();
      const before = await graph.getNodeProps(id);
      if (before === null) {
        throw new Error(`[NOT_FOUND] Quest ${id} not found in the graph`);
      }
      const status = String(before['status'] ?? '');
      if (status !== 'READY') {
        throw new Error(`[INVALID_FROM] claim requires status READY, quest ${id} is ${status || 'unknown'}`);
      }
      const assignedTo = typeof before['assigned_to'] === 'string'
        ? before['assigned_to']
        : undefined;
      if (assignedTo && assignedTo !== ctx.agentId) {
        throw new Error(`[CONFLICT] claim requires an unassigned quest or an existing self-assignment, quest ${id} is assigned to ${assignedTo}`);
      }

      ctx.warn(`[*] Attempting to claim ${id} as ${ctx.agentId}...`);

      await graph.patch((p) => {
        p.setProperty(id, 'assigned_to', ctx.agentId)
          .setProperty(id, 'status', 'IN_PROGRESS')
          .setProperty(id, 'claimed_at', Date.now());
      });

      // Verify claim post-materialization (The OCP Verification Step)
      const props = await graph.getNodeProps(id);

      const confirmed = !!(props && props['assigned_to'] === ctx.agentId);

      if (ctx.json) {
        if (!confirmed) {
          const winner = props ? String(props['assigned_to']) : 'unknown';
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
        const winner = props ? props['assigned_to'] : 'unknown';
        ctx.fail(`[FAIL] Lost race condition for ${id}. Current owner: ${String(winner)}`);
      }
    }));

  program
    .command('history <id>')
    .description('Show provenance: all patches that touched a node (Constitution Art. III)')
    .action(withErrorHandler(async (id: string) => {
      const graph = await ctx.graphPort.getGraph();

      await assertNodeExists(graph, id, 'Node');

      await graph.materialize();
      const patches = await graph.patchesFor(id);

      if (ctx.json) {
        ctx.jsonOut({
          success: true, command: 'history',
          data: { id, patchCount: patches.length, patches },
        });
        return;
      }

      if (patches.length === 0) {
        ctx.muted(`No patches found for ${id}`);
        return;
      }

      ctx.ok(`[PROVENANCE] ${id} — ${patches.length} patch(es):`);
      for (const sha of patches) {
        ctx.muted(`  ${sha.slice(0, 12)}`);
      }
    }));
}
