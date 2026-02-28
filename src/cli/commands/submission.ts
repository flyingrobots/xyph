import type { Command } from 'commander';
import type { CliContext } from '../context.js';
import { createErrorHandler } from '../errorHandler.js';
import { assertMinLength } from '../validators.js';
import { generateId } from '../generateId.js';

export function registerSubmissionCommands(program: Command, ctx: CliContext): void {
  const withErrorHandler = createErrorHandler(ctx);

  program
    .command('submit <quest-id>')
    .description('Submit a quest for review — creates submission + first patchset')
    .requiredOption('--description <text>', 'Description of the changes (min 10 chars)')
    .option('--base <ref>', 'Base branch (default: main)', 'main')
    .option('--workspace <ref>', 'Workspace reference (default: current git branch)')
    .action(withErrorHandler(async (questId: string, opts: { description: string; base: string; workspace?: string }) => {
      assertMinLength(opts.description, 10, '--description');

      const { WarpSubmissionAdapter } = await import('../../infrastructure/adapters/WarpSubmissionAdapter.js');
      const { SubmissionService } = await import('../../domain/services/SubmissionService.js');
      const { GitWorkspaceAdapter } = await import('../../infrastructure/adapters/GitWorkspaceAdapter.js');

      const adapter = new WarpSubmissionAdapter(ctx.graphPort, ctx.agentId);
      const service = new SubmissionService(adapter);
      await service.validateSubmit(questId, ctx.agentId);

      const workspace = new GitWorkspaceAdapter(process.cwd());
      const workspaceRef = opts.workspace ?? await workspace.getWorkspaceRef();
      let headRef: string | undefined;
      let commitShas: string[] | undefined;
      try {
        headRef = await workspace.getHeadCommit(workspaceRef);
        commitShas = await workspace.getCommitsSince(opts.base);
      } catch {
        // Non-fatal: workspace info is optional
      }

      const submissionId = `submission:${generateId()}`;
      const patchsetId = `patchset:${generateId()}`;

      const { patchSha } = await adapter.submit({
        questId,
        submissionId,
        patchsetId,
        patchset: {
          workspaceRef,
          baseRef: opts.base,
          headRef,
          commitShas,
          description: opts.description,
        },
      });

      ctx.ok(`[OK] Submission ${submissionId} created.`);
      ctx.muted(`  Patchset:  ${patchsetId}`);
      ctx.muted(`  Quest:     ${questId}`);
      ctx.muted(`  Workspace: ${workspaceRef}`);
      ctx.muted(`  Patch:     ${patchSha}`);
    }));

  program
    .command('revise <submission-id>')
    .description('Add a new patchset to an existing submission, superseding the current tip')
    .requiredOption('--description <text>', 'Description of the revision (min 10 chars)')
    .option('--workspace <ref>', 'Workspace reference (default: current git branch)')
    .option('--base <ref>', 'Base branch (default: main)', 'main')
    .action(withErrorHandler(async (submissionId: string, opts: { description: string; workspace?: string; base: string }) => {
      assertMinLength(opts.description, 10, '--description');

      const { WarpSubmissionAdapter } = await import('../../infrastructure/adapters/WarpSubmissionAdapter.js');
      const { SubmissionService } = await import('../../domain/services/SubmissionService.js');
      const { GitWorkspaceAdapter } = await import('../../infrastructure/adapters/GitWorkspaceAdapter.js');
      const { computeTipPatchset } = await import('../../domain/entities/Submission.js');

      const adapter = new WarpSubmissionAdapter(ctx.graphPort, ctx.agentId);
      const service = new SubmissionService(adapter);
      await service.validateRevise(submissionId, ctx.agentId);

      // Find the current tip to supersede
      const patchsetRefs = await adapter.getPatchsetRefs(submissionId);
      const { tip } = computeTipPatchset(patchsetRefs);
      if (!tip) {
        return ctx.fail(`No existing patchsets found for ${submissionId}`);
      }

      const workspace = new GitWorkspaceAdapter(process.cwd());
      const workspaceRef = opts.workspace ?? await workspace.getWorkspaceRef();
      let headRef: string | undefined;
      let commitShas: string[] | undefined;
      try {
        headRef = await workspace.getHeadCommit(workspaceRef);
        commitShas = await workspace.getCommitsSince(opts.base);
      } catch {
        // Non-fatal
      }

      const patchsetId = `patchset:${generateId()}`;

      const { patchSha } = await adapter.revise({
        submissionId,
        patchsetId,
        supersedesPatchsetId: tip.id,
        patchset: {
          workspaceRef,
          baseRef: opts.base,
          headRef,
          commitShas,
          description: opts.description,
        },
      });

      ctx.ok(`[OK] Revision ${patchsetId} created.`);
      ctx.muted(`  Supersedes: ${tip.id}`);
      ctx.muted(`  Workspace:  ${workspaceRef}`);
      ctx.muted(`  Patch:      ${patchSha}`);
    }));

  program
    .command('review <patchset-id>')
    .description('Review a patchset — approve, request changes, or comment')
    .requiredOption('--verdict <type>', 'approve | request-changes | comment')
    .requiredOption('--comment <text>', 'Review feedback')
    .action(withErrorHandler(async (patchsetId: string, opts: { verdict: string; comment: string }) => {
      const validVerdicts = ['approve', 'request-changes', 'comment'] as const;
      if (!validVerdicts.includes(opts.verdict as typeof validVerdicts[number])) {
        return ctx.fail(`--verdict must be one of: ${validVerdicts.join(', ')}. Got: '${opts.verdict}'`);
      }

      const { WarpSubmissionAdapter } = await import('../../infrastructure/adapters/WarpSubmissionAdapter.js');
      const { SubmissionService } = await import('../../domain/services/SubmissionService.js');

      const adapter = new WarpSubmissionAdapter(ctx.graphPort, ctx.agentId);
      const service = new SubmissionService(adapter);
      await service.validateReview(patchsetId, ctx.agentId);

      const reviewId = `review:${generateId()}`;
      const verdict = opts.verdict as 'approve' | 'request-changes' | 'comment';

      const { patchSha } = await adapter.review({
        patchsetId,
        reviewId,
        verdict,
        comment: opts.comment,
      });

      ctx.ok(`[OK] Review ${reviewId} posted.`);
      ctx.muted(`  Verdict:  ${verdict}`);
      ctx.muted(`  Patchset: ${patchsetId}`);
      ctx.muted(`  Patch:    ${patchSha}`);
    }));

  program
    .command('merge <submission-id>')
    .description('Merge a submission — settles the workspace and auto-seals the quest')
    .requiredOption('--rationale <text>', 'Merge rationale')
    .option('--into <ref>', 'Target branch', 'main')
    .option('--patchset <id>', 'Explicit patchset ID (required when multiple heads exist)')
    .action(withErrorHandler(async (submissionId: string, opts: { rationale: string; into: string; patchset?: string }) => {
      const { WarpSubmissionAdapter } = await import('../../infrastructure/adapters/WarpSubmissionAdapter.js');
      const { SubmissionService } = await import('../../domain/services/SubmissionService.js');
      const { GitWorkspaceAdapter } = await import('../../infrastructure/adapters/GitWorkspaceAdapter.js');
      const { GuildSealService } = await import('../../domain/services/GuildSealService.js');

      const adapter = new WarpSubmissionAdapter(ctx.graphPort, ctx.agentId);
      const service = new SubmissionService(adapter);
      const { tipPatchsetId } = await service.validateMerge(submissionId, ctx.agentId, opts.patchset);

      // Get workspace ref from the tip patchset
      const workspaceRef = await adapter.getPatchsetWorkspaceRef(tipPatchsetId);
      if (typeof workspaceRef !== 'string') {
        return ctx.fail(`Could not resolve workspace ref from patchset ${tipPatchsetId}`);
      }

      // Git settlement
      const workspace = new GitWorkspaceAdapter(process.cwd());
      let mergeCommit: string | undefined;
      const alreadyMerged = await workspace.isMerged(workspaceRef, opts.into);
      if (alreadyMerged) {
        mergeCommit = await workspace.getHeadCommit(opts.into);
        if (!mergeCommit) {
          return ctx.fail(`Could not resolve HEAD of ${opts.into}`);
        }
        ctx.muted(`  Branch ${workspaceRef} already merged into ${opts.into}`);
      } else {
        mergeCommit = await workspace.merge(workspaceRef, opts.into);
        ctx.muted(`  Merged ${workspaceRef} into ${opts.into}: ${mergeCommit.slice(0, 7)}`);
      }

      // Create merge decision
      const decisionId = `decision:${generateId()}`;
      const { patchSha } = await adapter.decide({
        submissionId,
        decisionId,
        kind: 'merge',
        rationale: opts.rationale,
        mergeCommit,
      });

      // Auto-seal: create scroll + sign with GuildSealService + set quest DONE
      const questId = await adapter.getSubmissionQuestId(submissionId);
      if (questId) {
        const questStatus = await adapter.getQuestStatus(questId);
        if (questStatus === 'DONE') {
          ctx.warn(`[WARN] Quest ${questId} is already DONE — skipping auto-seal.`);
        } else {
          const now = Date.now();
          const sealService = new GuildSealService();
          const scrollPayload = {
            artifactHash: mergeCommit ?? 'unknown',
            questId,
            rationale: opts.rationale,
            sealedBy: ctx.agentId,
            sealedAt: now,
          };
          const guildSeal = await sealService.sign(scrollPayload, ctx.agentId);

          const sealGraph = await ctx.graphPort.getGraph();
          const scrollId = `artifact:${questId}`;

          await sealGraph.patch((p) => {
            p.addNode(scrollId)
              .setProperty(scrollId, 'artifact_hash', mergeCommit ?? 'unknown')
              .setProperty(scrollId, 'rationale', opts.rationale)
              .setProperty(scrollId, 'type', 'scroll')
              .setProperty(scrollId, 'sealed_by', ctx.agentId)
              .setProperty(scrollId, 'sealed_at', now)
              .setProperty(scrollId, 'payload_digest', sealService.payloadDigest(scrollPayload))
              .addEdge(scrollId, questId, 'fulfills');

            if (guildSeal) {
              p.setProperty(scrollId, 'guild_seal_alg', guildSeal.alg)
                .setProperty(scrollId, 'guild_seal_key_id', guildSeal.keyId)
                .setProperty(scrollId, 'guild_seal_sig', guildSeal.sig);
            }

            p.setProperty(questId, 'status', 'DONE')
              .setProperty(questId, 'completed_at', now);
          });

          ctx.ok(`[OK] Quest ${questId} auto-sealed via merge.`);
          if (guildSeal) {
            ctx.muted(`  Guild Seal: ${guildSeal.keyId}`);
          }
        }
      }

      ctx.ok(`[OK] Submission ${submissionId} merged.`);
      ctx.muted(`  Decision: ${decisionId}`);
      ctx.muted(`  Patch:    ${patchSha}`);
    }));

  program
    .command('close <submission-id>')
    .description('Close a submission without merging')
    .requiredOption('--rationale <text>', 'Reason for closing')
    .action(withErrorHandler(async (submissionId: string, opts: { rationale: string }) => {
      const { WarpSubmissionAdapter } = await import('../../infrastructure/adapters/WarpSubmissionAdapter.js');
      const { SubmissionService } = await import('../../domain/services/SubmissionService.js');

      const adapter = new WarpSubmissionAdapter(ctx.graphPort, ctx.agentId);
      const service = new SubmissionService(adapter);
      await service.validateClose(submissionId, ctx.agentId);

      const decisionId = `decision:${generateId()}`;
      const { patchSha } = await adapter.decide({
        submissionId,
        decisionId,
        kind: 'close',
        rationale: opts.rationale,
      });

      ctx.ok(`[OK] Submission ${submissionId} closed.`);
      ctx.muted(`  Decision:  ${decisionId}`);
      ctx.muted(`  Rationale: ${opts.rationale}`);
      ctx.muted(`  Patch:     ${patchSha}`);
    }));
}
