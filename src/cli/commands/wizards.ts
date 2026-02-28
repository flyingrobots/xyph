import type { Command } from 'commander';
import type { CliContext } from '../context.js';
import { createErrorHandler } from '../errorHandler.js';
import { assertPrefix } from '../validators.js';
import { generateId } from '../generateId.js';
import type { GraphSnapshot } from '../../domain/models/dashboard.js';

/** Lightweight snapshot fetch for wizard option lists. */
async function fetchWizardSnapshot(ctx: CliContext): Promise<GraphSnapshot> {
  const { createGraphContext } = await import('../../infrastructure/GraphContext.js');
  const gctx = createGraphContext(ctx.graphPort);
  return gctx.fetchSnapshot();
}

export function registerWizardCommands(program: Command, ctx: CliContext): void {
  const withErrorHandler = createErrorHandler(ctx);

  // ── quest-wizard: interactive quest creation ─────────────────────────
  program
    .command('quest-wizard')
    .description('Interactive quest creation wizard')
    .action(withErrorHandler(async () => {
      if (ctx.json) return ctx.fail('Interactive mode not available with --json. Use quest command with flags.');

      const { filter, input: bijouInput, confirm } = await import('@flyingrobots/bijou');
      const snap = await fetchWizardSnapshot(ctx);

      // Pick campaign
      const campaignOptions = snap.campaigns.map(c => ({
        label: `${c.id}: ${c.title}`,
        value: c.id,
        keywords: [c.id, c.title],
      }));

      let campaignId = 'none';
      if (campaignOptions.length === 1 && campaignOptions[0]) {
        campaignId = campaignOptions[0].value;
        ctx.muted(`  Campaign: ${campaignId} (auto-selected)`);
      } else if (campaignOptions.length > 1) {
        campaignId = await filter<string>({
          title: 'Campaign',
          options: [
            { label: '(none)', value: 'none', keywords: ['none', 'skip'] },
            ...campaignOptions,
          ],
        });
      }

      // Quest ID
      const suggestedId = `task:${generateId().slice(0, 8).toUpperCase()}`;
      const questId = await bijouInput({
        title: 'Quest ID',
        defaultValue: suggestedId,
        validate: (v) => v.startsWith('task:')
          ? { valid: true }
          : { valid: false, message: 'Must start with task:' },
      });

      // Title
      const title = await bijouInput({
        title: 'Quest title',
        validate: (v) => v.trim().length >= 5
          ? { valid: true }
          : { valid: false, message: 'At least 5 characters' },
      });

      // Hours (optional)
      const hoursStr = await bijouInput({
        title: 'Estimated hours (optional, 0 to skip)',
        defaultValue: '0',
      });
      const hours = Number(hoursStr) || 0;

      // Intent (required by constitution)
      const intentOptions = snap.intents.map(i => ({
        label: `${i.id}: ${i.title}`,
        value: i.id,
        keywords: [i.id, i.title],
      }));

      if (intentOptions.length === 0) {
        return ctx.fail(
          '[CONSTITUTION VIOLATION] No intents exist. Declare one first:\n' +
          '  xyph-actuator intent <id> --title "..." --requested-by human.<name>',
        );
      }

      const intentId = await filter<string>({
        title: 'Authorizing intent',
        options: intentOptions,
      });

      // Confirm
      ctx.print('');
      ctx.print(`  Quest:    ${questId}`);
      ctx.print(`  Title:    ${title}`);
      ctx.print(`  Campaign: ${campaignId}`);
      ctx.print(`  Intent:   ${intentId}`);
      ctx.print(`  Hours:    ${hours}`);
      ctx.print('');

      const ok = await confirm({ title: 'Create quest?' });
      if (!ok) {
        ctx.warn('[CANCELLED]');
        return;
      }

      assertPrefix(questId, 'task:', 'Quest ID');
      assertPrefix(intentId, 'intent:', 'Intent ID');

      const graph = await ctx.graphPort.getGraph();
      const sha = await graph.patch((p) => {
        p.addNode(questId)
          .setProperty(questId, 'title', title)
          .setProperty(questId, 'status', 'BACKLOG')
          .setProperty(questId, 'hours', hours)
          .setProperty(questId, 'type', 'task');

        if (campaignId !== 'none') {
          p.addEdge(questId, campaignId, 'belongs-to');
        }
        p.addEdge(questId, intentId, 'authorized-by');
      });

      const campaignNote = campaignId === 'none' ? '(no campaign)' : `in campaign ${campaignId}`;
      ctx.ok(`[OK] Quest ${questId} initialized ${campaignNote}. Patch: ${sha}`);
    }));

  // ── review-wizard: interactive review ────────────────────────────────
  program
    .command('review-wizard')
    .description('Interactive review wizard — pick submission, verdict, and comment')
    .action(withErrorHandler(async () => {
      if (ctx.json) return ctx.fail('Interactive mode not available with --json. Use review command with flags.');

      const { filter, select, textarea } = await import('@flyingrobots/bijou');
      const snap = await fetchWizardSnapshot(ctx);

      const openSubs = snap.submissions.filter(s => s.status === 'OPEN');
      if (openSubs.length === 0) {
        return ctx.fail('No open submissions to review.');
      }

      const subOptions = openSubs.map(s => {
        const qTitle = snap.quests.find(q => q.id === s.questId)?.title ?? s.questId;
        return {
          label: `${s.id.replace('submission:', '')} — ${qTitle} (${s.status})`,
          value: s.id,
          keywords: [s.id, qTitle, s.status],
        };
      });

      const submissionId = await filter<string>({
        title: 'Select submission to review',
        options: subOptions,
      });

      const sub = snap.submissions.find(s => s.id === submissionId);
      if (!sub?.tipPatchsetId) {
        return ctx.fail(`No patchset found for ${submissionId}`);
      }

      const verdict = await select<'approve' | 'request-changes' | 'comment'>({
        title: 'Verdict',
        options: [
          { label: 'Approve', value: 'approve' as const },
          { label: 'Request changes', value: 'request-changes' as const },
          { label: 'Comment (no verdict)', value: 'comment' as const },
        ],
      });

      const comment = await textarea({
        title: 'Review comment',
      });

      const { WarpSubmissionAdapter } = await import('../../infrastructure/adapters/WarpSubmissionAdapter.js');
      const { SubmissionService } = await import('../../domain/services/SubmissionService.js');

      const adapter = new WarpSubmissionAdapter(ctx.graphPort, ctx.agentId);
      const service = new SubmissionService(adapter);
      await service.validateReview(sub.tipPatchsetId, ctx.agentId);

      const reviewId = `review:${generateId()}`;
      const { patchSha } = await adapter.review({
        patchsetId: sub.tipPatchsetId,
        reviewId,
        verdict,
        comment,
      });

      ctx.ok(`[OK] Review ${reviewId} posted.`);
      ctx.muted(`  Verdict:  ${verdict}`);
      ctx.muted(`  Patchset: ${sub.tipPatchsetId}`);
      ctx.muted(`  Patch:    ${patchSha}`);
    }));

  // ── promote-wizard: interactive promote ──────────────────────────────
  program
    .command('promote-wizard <id>')
    .description('Interactive promote wizard — select intent and campaign')
    .action(withErrorHandler(async (id: string) => {
      if (ctx.json) return ctx.fail('Interactive mode not available with --json. Use promote command with flags.');

      assertPrefix(id, 'task:', 'Task ID');

      const { filter, confirm } = await import('@flyingrobots/bijou');
      const snap = await fetchWizardSnapshot(ctx);

      const intentOptions = snap.intents.map(i => ({
        label: `${i.id}: ${i.title}`,
        value: i.id,
        keywords: [i.id, i.title],
      }));

      if (intentOptions.length === 0) {
        return ctx.fail('No intents exist. Declare one first.');
      }

      const intentId = await filter<string>({
        title: 'Authorizing intent',
        options: intentOptions,
      });

      const campaignOptions = snap.campaigns.map(c => ({
        label: `${c.id}: ${c.title}`,
        value: c.id,
        keywords: [c.id, c.title],
      }));

      let campaignId: string | undefined;
      if (campaignOptions.length > 0) {
        const assignCampaign = await confirm({ title: 'Assign to a campaign?' });
        if (assignCampaign) {
          campaignId = await filter<string>({
            title: 'Target campaign',
            options: campaignOptions,
          });
        }
      }

      const ok = await confirm({ title: `Promote ${id} to BACKLOG?` });
      if (!ok) {
        ctx.warn('[CANCELLED]');
        return;
      }

      const { WarpIntakeAdapter } = await import('../../infrastructure/adapters/WarpIntakeAdapter.js');
      const intake = new WarpIntakeAdapter(ctx.graphPort, ctx.agentId);
      const sha = await intake.promote(id, intentId, campaignId);

      ctx.ok(`[OK] Task ${id} promoted to BACKLOG.`);
      ctx.muted(`  Intent:   ${intentId}`);
      if (campaignId !== undefined) ctx.muted(`  Campaign: ${campaignId}`);
      ctx.muted(`  Patch: ${sha}`);
    }));

  // ── triage: interactive inbox triage loop ────────────────────────────
  program
    .command('triage')
    .description('Interactive triage session — process inbox items one by one')
    .action(withErrorHandler(async () => {
      if (ctx.json) return ctx.fail('Triage is interactive-only. Use promote/reject with --json instead.');

      const { filter, select, input: bijouInput, confirm } = await import('@flyingrobots/bijou');

      const snap = await fetchWizardSnapshot(ctx);
      // INBOX items are normalized to BACKLOG in the snapshot.
      // Distinguish true inbox items: they have suggestedBy but no intentId (not yet promoted).
      const inboxQuests = snap.quests.filter(q => q.status === 'BACKLOG' && q.suggestedBy && !q.intentId);

      if (inboxQuests.length === 0) {
        ctx.ok('[OK] Inbox is empty — nothing to triage.');
        return;
      }

      ctx.print(`\n  ${inboxQuests.length} item(s) in inbox.\n`);

      let processed = 0;
      let promoted = 0;
      let rejected = 0;

      for (const quest of inboxQuests) {
        ctx.print(`\n  ── ${quest.id}: ${quest.title} ──`);
        if (quest.suggestedBy) ctx.muted(`  Suggested by: ${quest.suggestedBy}`);
        if (quest.hours > 0) ctx.muted(`  Hours: ${quest.hours}`);

        const action = await select<'promote' | 'reject' | 'skip' | 'stop'>({
          title: `Action for ${quest.id}`,
          options: [
            { label: 'Promote to BACKLOG', value: 'promote' as const },
            { label: 'Reject to GRAVEYARD', value: 'reject' as const },
            { label: 'Skip (leave in INBOX)', value: 'skip' as const },
            { label: 'Stop triage session', value: 'stop' as const },
          ],
        });

        if (action === 'stop') break;
        if (action === 'skip') { processed++; continue; }

        if (action === 'promote') {
          const intentOptions = snap.intents.map(i => ({
            label: `${i.id}: ${i.title}`,
            value: i.id,
            keywords: [i.id, i.title],
          }));

          if (intentOptions.length === 0) {
            ctx.warn('  No intents available. Declare one first with: xyph-actuator intent <id> ...');
            processed++;
            continue;
          }

          const intentId = await filter<string>({
            title: 'Authorizing intent',
            options: intentOptions,
          });

          const campaignOptions = snap.campaigns.map(c => ({
            label: `${c.id}: ${c.title}`,
            value: c.id,
            keywords: [c.id, c.title],
          }));

          let campaignId: string | undefined;
          if (campaignOptions.length > 0) {
            const assignCampaign = await confirm({ title: 'Assign to a campaign?' });
            if (assignCampaign) {
              campaignId = await filter<string>({
                title: 'Target campaign',
                options: campaignOptions,
              });
            }
          }

          const { WarpIntakeAdapter } = await import('../../infrastructure/adapters/WarpIntakeAdapter.js');
          const intake = new WarpIntakeAdapter(ctx.graphPort, ctx.agentId);
          await intake.promote(quest.id, intentId, campaignId);
          ctx.ok(`  [OK] ${quest.id} promoted.`);
          promoted++;
        }

        if (action === 'reject') {
          const rationale = await bijouInput({
            title: `Rejection rationale for ${quest.id}`,
            validate: (v) => v.trim().length > 0
              ? { valid: true }
              : { valid: false, message: 'Rationale required' },
          });

          const { WarpIntakeAdapter } = await import('../../infrastructure/adapters/WarpIntakeAdapter.js');
          const intake = new WarpIntakeAdapter(ctx.graphPort, ctx.agentId);
          await intake.reject(quest.id, rationale);
          ctx.ok(`  [OK] ${quest.id} rejected.`);
          rejected++;
        }

        processed++;
      }

      ctx.print('');
      ctx.ok(`[DONE] Triage session complete: ${processed} processed, ${promoted} promoted, ${rejected} rejected.`);
    }));
}
