import type { Command } from 'commander';
import type { CliContext } from '../context.js';
import { createErrorHandler } from '../errorHandler.js';
import { assertPrefix } from '../validators.js';

/**
 * Shared validation + graph write for campaign and intent linking.
 * Used by move, authorize, and the convenience link command.
 */
async function applyLink(
  ctx: CliContext,
  quest: string,
  campaignId: string | undefined,
  intentId: string | undefined,
): Promise<{ campaign: string | null; intent: string | null; patch: string }> {
  // Sovereignty guard: wiring authorized-by requires human authority (Constitution Art. IV)
  if (intentId !== undefined && !ctx.agentId.startsWith('human.')) {
    throw new Error(
      `[FORBIDDEN] authorize requires a human principal (human.*), got: '${ctx.agentId}'`,
    );
  }

  const graph = await ctx.graphPort.getGraph();

  if (!await graph.hasNode(quest)) {
    throw new Error(`[NOT_FOUND] Quest ${quest} not found in the graph`);
  }
  if (campaignId !== undefined && !await graph.hasNode(campaignId)) {
    throw new Error(`[NOT_FOUND] Campaign ${campaignId} not found in the graph`);
  }
  if (intentId !== undefined && !await graph.hasNode(intentId)) {
    throw new Error(`[NOT_FOUND] Intent ${intentId} not found in the graph`);
  }

  const sha = await graph.patch((p) => {
    if (campaignId !== undefined) {
      p.addEdge(quest, campaignId, 'belongs-to');
    }
    if (intentId !== undefined) {
      p.addEdge(quest, intentId, 'authorized-by');
    }
  });

  return { campaign: campaignId ?? null, intent: intentId ?? null, patch: sha };
}

function assertCampaignPrefix(id: string): void {
  if (!id.startsWith('campaign:') && !id.startsWith('milestone:')) {
    throw new Error(`--campaign must start with 'campaign:' or 'milestone:', got: '${id}'`);
  }
}

export function registerLinkCommands(program: Command, ctx: CliContext): void {
  const withErrorHandler = createErrorHandler(ctx);

  // --- move: reassign quest to a campaign ---
  program
    .command('move <quest>')
    .description('Reassign a quest to a campaign (updates belongs-to edge)')
    .requiredOption('--campaign <id>', 'Target campaign (campaign:* or milestone:*)')
    .action(withErrorHandler(async (quest: string, opts: { campaign: string }) => {
      assertPrefix(quest, 'task:', 'Quest ID');
      assertCampaignPrefix(opts.campaign);

      const result = await applyLink(ctx, quest, opts.campaign, undefined);

      if (ctx.json) {
        ctx.jsonOut({ success: true, command: 'move', data: { quest, ...result } });
        return;
      }
      ctx.ok(`[OK] Moved ${quest} → ${opts.campaign}. Patch: ${result.patch}`);
    }));

  // --- authorize: wire quest to a sovereign intent ---
  program
    .command('authorize <quest>')
    .description('Wire a quest to a sovereign intent (adds authorized-by edge)')
    .requiredOption('--intent <id>', 'Sovereign intent (intent:*)')
    .action(withErrorHandler(async (quest: string, opts: { intent: string }) => {
      assertPrefix(quest, 'task:', 'Quest ID');
      assertPrefix(opts.intent, 'intent:', '--intent');

      const result = await applyLink(ctx, quest, undefined, opts.intent);

      if (ctx.json) {
        ctx.jsonOut({ success: true, command: 'authorize', data: { quest, ...result } });
        return;
      }
      ctx.ok(`[OK] Authorized ${quest} via ${opts.intent}. Patch: ${result.patch}`);
    }));

  // --- link: convenience command (move + authorize in one step) ---
  program
    .command('link <quest>')
    .description('Link a quest to a campaign and intent in one step (move + authorize)')
    .requiredOption('--campaign <id>', 'Campaign to assign (campaign:* or milestone:*)')
    .requiredOption('--intent <id>', 'Sovereign intent to authorize (intent:*)')
    .action(withErrorHandler(async (quest: string, opts: { campaign: string; intent: string }) => {
      assertPrefix(quest, 'task:', 'Quest ID');
      assertCampaignPrefix(opts.campaign);
      assertPrefix(opts.intent, 'intent:', '--intent');

      const result = await applyLink(ctx, quest, opts.campaign, opts.intent);

      if (ctx.json) {
        ctx.jsonOut({ success: true, command: 'link', data: { quest, ...result } });
        return;
      }
      ctx.ok(`[OK] Linked ${quest} → campaign: ${opts.campaign}, intent: ${opts.intent}. Patch: ${result.patch}`);
    }));
}
