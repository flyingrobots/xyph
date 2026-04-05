import type { Command } from 'commander';
import type { CliContext } from '../context.js';
import { createErrorHandler } from '../errorHandler.js';
import type { QuestStatus } from '../../domain/entities/Quest.js';
import { VALID_STATUSES } from '../../domain/entities/Quest.js';
import { liveObservation } from '../../ports/ObservationPort.js';
import type { QuestNode } from '../../domain/models/dashboard.js';

function matchesKeyword(q: QuestNode, keyword: string): boolean {
  const lower = keyword.toLowerCase();
  if (q.id.toLowerCase().includes(lower)) return true;
  if (q.title.toLowerCase().includes(lower)) return true;
  if (q.description?.toLowerCase().includes(lower)) return true;
  return false;
}

function questToResult(q: QuestNode): Record<string, unknown> {
  const result: Record<string, unknown> = {
    id: q.id,
    title: q.title,
    status: q.status,
    hours: q.hours,
  };
  if (q.priority !== undefined) result['priority'] = q.priority;
  if (q.description !== undefined) result['description'] = q.description;
  if (q.campaignId !== undefined) result['campaignId'] = q.campaignId;
  if (q.intentId !== undefined) result['intentId'] = q.intentId;
  if (q.assignedTo !== undefined) result['assignedTo'] = q.assignedTo;
  if (q.rejectedBy !== undefined) result['rejectedBy'] = q.rejectedBy;
  if (q.rejectionRationale !== undefined) result['rejectionRationale'] = q.rejectionRationale;
  if (q.suggestedBy !== undefined) result['suggestedBy'] = q.suggestedBy;
  return result;
}

export function registerSearchCommands(program: Command, ctx: CliContext): void {
  const withErrorHandler = createErrorHandler(ctx);

  program
    .command('search [keyword]')
    .description('Search quests by keyword, filter by status, or show summary stats')
    .option('--status <status>', 'Filter by quest status (BACKLOG, PLANNED, READY, IN_PROGRESS, BLOCKED, DONE, GRAVEYARD)')
    .option('--stats', 'Show quest counts grouped by status')
    .action(withErrorHandler(async (keyword: string | undefined, opts: { status?: string; stats?: boolean }) => {
      if (opts.status !== undefined && !VALID_STATUSES.has(opts.status)) {
        throw new Error(`Invalid --status '${opts.status}'. Valid: ${[...VALID_STATUSES].join(', ')}`);
      }

      const readSession = await ctx.observation.openSession(
        liveObservation('search'),
      );
      // Always include graveyard — search should see everything
      const snapshot = await readSession.fetchSnapshot('operational');
      const allQuests = snapshot.quests;

      // ── Stats mode ────────────────────────────────────────────────
      if (opts.stats) {
        const counts: Record<string, number> = {};
        for (const q of allQuests) {
          counts[q.status] = (counts[q.status] ?? 0) + 1;
        }

        if (ctx.json) {
          ctx.jsonOut({
            success: true,
            command: 'search',
            data: { counts, total: allQuests.length },
          });
          return;
        }

        ctx.ok(`Quest counts (${allQuests.length} total):`);
        for (const status of [...VALID_STATUSES].sort()) {
          const count = counts[status] ?? 0;
          if (count > 0) {
            ctx.muted(`  ${status}: ${String(count)}`);
          }
        }
        return;
      }

      // ── Search / filter mode ──────────────────────────────────────
      let results = allQuests;

      if (opts.status !== undefined) {
        const statusFilter = opts.status as QuestStatus;
        results = results.filter((q) => q.status === statusFilter);
      }

      if (keyword !== undefined && keyword.length > 0) {
        results = results.filter((q) => matchesKeyword(q, keyword));
      }

      if (ctx.json) {
        ctx.jsonOut({
          success: true,
          command: 'search',
          data: {
            results: results.map(questToResult),
            count: results.length,
          },
        });
        return;
      }

      if (results.length === 0) {
        ctx.ok('[OK] No quests matched.');
        return;
      }

      ctx.ok(`[OK] ${String(results.length)} quest(s) matched:`);
      for (const q of results) {
        ctx.muted(`  ${q.id} [${q.status}] — ${q.title}`);
        if (q.rejectionRationale !== undefined) {
          ctx.muted(`    Reason: ${q.rejectionRationale}`);
        }
      }
    }));
}
