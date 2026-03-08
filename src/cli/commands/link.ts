import type { Command } from 'commander';
import type { CliContext } from '../context.js';
import { createErrorHandler } from '../errorHandler.js';
import { assertPrefix, assertPrefixOneOf, assertNodeExists } from '../validators.js';
import { toNeighborEntries } from '../../infrastructure/helpers/isNeighborEntry.js';

/**
 * Shared validation + graph write for campaign and intent linking.
 * Used by move, authorize, and the convenience link command.
 *
 * When `campaignId` is provided, any existing `belongs-to` edge is removed
 * before the new one is added — enforcing single-campaign cardinality.
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

  await assertNodeExists(graph, quest, 'Quest');
  if (campaignId !== undefined) await assertNodeExists(graph, campaignId, 'Campaign');
  if (intentId !== undefined) await assertNodeExists(graph, intentId, 'Intent');

  // Discover existing edges so move/authorize replaces rather than accumulates
  const existingCampaignEdges: { nodeId: string }[] = [];
  const existingIntentEdges: { nodeId: string }[] = [];
  if (campaignId !== undefined || intentId !== undefined) {
    const neighbors = toNeighborEntries(await graph.neighbors(quest, 'outgoing'));
    for (const n of neighbors) {
      if (campaignId !== undefined && n.label === 'belongs-to') {
        existingCampaignEdges.push({ nodeId: n.nodeId });
      }
      if (intentId !== undefined && n.label === 'authorized-by') {
        existingIntentEdges.push({ nodeId: n.nodeId });
      }
    }
  }

  const sha = await graph.patch((p) => {
    if (campaignId !== undefined) {
      // Remove any existing belongs-to edges first (single-campaign cardinality)
      for (const old of existingCampaignEdges) {
        p.removeEdge(quest, old.nodeId, 'belongs-to');
      }
      p.addEdge(quest, campaignId, 'belongs-to');
    }
    if (intentId !== undefined) {
      // Remove any existing authorized-by edges first (single-intent cardinality)
      for (const old of existingIntentEdges) {
        p.removeEdge(quest, old.nodeId, 'authorized-by');
      }
      p.addEdge(quest, intentId, 'authorized-by');
    }
  });

  return { campaign: campaignId ?? null, intent: intentId ?? null, patch: sha };
}

const CAMPAIGN_PREFIXES = ['campaign:', 'milestone:'] as const;
function assertCampaignPrefix(id: string): void {
  assertPrefixOneOf(id, CAMPAIGN_PREFIXES, '--campaign');
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
