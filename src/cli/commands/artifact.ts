import type { Command } from 'commander';
import type { CliContext } from '../context.js';
import { createErrorHandler } from '../errorHandler.js';

export function registerArtifactCommands(program: Command, ctx: CliContext): void {
  const withErrorHandler = createErrorHandler(ctx);

  program
    .command('seal <id>')
    .description('Mark Quest as DONE and seal with a Project Scroll')
    .requiredOption('--artifact <hash>', 'Content hash of the produced artifact')
    .requiredOption('--rationale <text>', 'Brief explanation of the solution')
    .action(withErrorHandler(async (id: string, opts: { artifact: string; rationale: string }) => {
      const { GuildSealService } = await import('../../domain/services/GuildSealService.js');
      const sealService = new GuildSealService();

      // Guard: warn if a non-terminal submission exists for this quest
      let openSubWarning: string | undefined;
      try {
        const { WarpSubmissionAdapter } = await import('../../infrastructure/adapters/WarpSubmissionAdapter.js');
        const subAdapter = new WarpSubmissionAdapter(ctx.graphPort, ctx.agentId);
        const openSubs = await subAdapter.getOpenSubmissionsForQuest(id);
        if (openSubs.length > 0) {
          openSubWarning = `Quest ${id} has open submission ${openSubs[0]}. Consider using 'merge' instead.`;
          ctx.warn(
            `  [WARN] Quest ${id} has an open submission: ${openSubs[0]}\n` +
            `  Consider using 'xyph merge' instead of 'xyph seal' to settle via the review workflow.`,
          );
        }
      } catch {
        // Non-fatal: if submission lookup fails, seal still proceeds
      }

      const now = Date.now();
      const scrollPayload = {
        artifactHash: opts.artifact,
        questId: id,
        rationale: opts.rationale,
        sealedBy: ctx.agentId,
        sealedAt: now,
      };

      const guildSeal = await sealService.sign(scrollPayload, ctx.agentId);

      const graph = await ctx.graphPort.getGraph();
      const scrollId = `artifact:${id}`;

      const sha = await graph.patch((p) => {
        p.addNode(scrollId)
          .setProperty(scrollId, 'artifact_hash', opts.artifact)
          .setProperty(scrollId, 'rationale', opts.rationale)
          .setProperty(scrollId, 'type', 'scroll')
          .setProperty(scrollId, 'sealed_by', ctx.agentId)
          .setProperty(scrollId, 'sealed_at', now)
          .setProperty(scrollId, 'payload_digest', sealService.payloadDigest(scrollPayload))
          .addEdge(scrollId, id, 'fulfills');

        if (guildSeal) {
          p.setProperty(scrollId, 'guild_seal_alg', guildSeal.alg)
            .setProperty(scrollId, 'guild_seal_key_id', guildSeal.keyId)
            .setProperty(scrollId, 'guild_seal_sig', guildSeal.sig);
        }

        p.setProperty(id, 'status', 'DONE')
          .setProperty(id, 'completed_at', now);
      });

      if (ctx.json) {
        const warnings: string[] = [];
        if (openSubWarning) warnings.push(openSubWarning);
        if (!guildSeal) warnings.push(`No private key found for ${ctx.agentId} — scroll is unsigned`);
        ctx.jsonOut({
          success: true, command: 'seal',
          data: {
            id, scrollId, artifactHash: opts.artifact, rationale: opts.rationale,
            sealedBy: ctx.agentId, sealedAt: now,
            guildSeal: guildSeal ? { keyId: guildSeal.keyId, alg: guildSeal.alg } : null,
            patch: sha, warnings,
          },
        });
        return;
      }

      if (guildSeal) {
        ctx.muted(`  Guild Seal: ${guildSeal.keyId}`);
      } else {
        ctx.warn(`  [WARN] No private key found for ${ctx.agentId} — scroll is unsigned. Run: xyph-actuator generate-key`);
      }

      ctx.ok(`[OK] Quest ${id} sealed. Scroll: ${scrollId}. Patch: ${sha}`);
    }));

  program
    .command('generate-key')
    .description('Generate an Ed25519 Guild Seal keypair for this agent')
    .action(withErrorHandler(async () => {
      const { GuildSealService } = await import('../../domain/services/GuildSealService.js');
      const sealService = new GuildSealService();

      const { keyId, publicKeyHex } = await sealService.generateKeypair(ctx.agentId);

      if (ctx.json) {
        ctx.jsonOut({
          success: true, command: 'generate-key',
          data: { agentId: ctx.agentId, keyId, publicKeyHex },
        });
        return;
      }

      ctx.ok(`[OK] Keypair generated for agent ${ctx.agentId}`);
      ctx.muted(`  Key ID:     ${keyId}`);
      ctx.muted(`  Public key: ${publicKeyHex}`);
      ctx.muted(`  Private key stored in trust/${ctx.agentId}.sk (gitignored)`);
    }));
}
