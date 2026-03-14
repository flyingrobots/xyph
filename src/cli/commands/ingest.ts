import type { Command } from 'commander';
import type { CliContext } from '../context.js';
import { createErrorHandler } from '../errorHandler.js';
import { assertMinLength, assertPrefix, parseHours } from '../validators.js';
import {
  VALID_QUEST_PRIORITIES,
  VALID_TASK_KINDS,
  type QuestKind,
  type QuestPriority,
} from '../../domain/entities/Quest.js';

function resolveTaskKind(raw: string | undefined): QuestKind {
  const taskKind = raw ?? 'delivery';
  if (!VALID_TASK_KINDS.has(taskKind)) {
    throw new Error(`--kind must be one of ${[...VALID_TASK_KINDS].join(', ')}`);
  }
  return taskKind as QuestKind;
}

function resolveQuestPriority(raw: string | undefined): QuestPriority {
  const priority = raw ?? 'P3';
  if (!VALID_QUEST_PRIORITIES.has(priority)) {
    throw new Error(`--priority must be one of ${[...VALID_QUEST_PRIORITIES].join(', ')}`);
  }
  return priority as QuestPriority;
}

export function registerIngestCommands(program: Command, ctx: CliContext): void {
  const withErrorHandler = createErrorHandler(ctx);

  program
    .command('quest <id>')
    .description('Initialize a new Quest node')
    .requiredOption('--title <text>', 'Quest title')
    .requiredOption('--campaign <id>', 'Parent Campaign ID (use "none" to skip)')
    .option('--description <text>', 'Durable quest description/body preview')
    .option('--kind <kind>', `Quest kind (${[...VALID_TASK_KINDS].join(' | ')})`)
    .option('--priority <level>', `Quest priority (${[...VALID_QUEST_PRIORITIES].join(' | ')})`)
    .option('--hours <number>', 'Estimated human hours (PERT)', parseHours)
    .option('--intent <id>', 'Sovereign Intent node that authorizes this Quest (intent:* prefix)')
    .action(withErrorHandler(async (id: string, opts: { title: string; campaign: string; description?: string; kind?: string; priority?: string; hours?: number; intent?: string }) => {
      assertPrefix(id, 'task:', 'Quest ID');
      if (opts.description !== undefined) assertMinLength(opts.description.trim(), 5, '--description');
      const taskKind = resolveTaskKind(opts.kind);
      const priority = resolveQuestPriority(opts.priority);

      const intentId = opts.intent;
      if (!intentId) {
        return ctx.fail(
          `[CONSTITUTION VIOLATION] Quest ${id} requires --intent <id> (Art. IV — Genealogy of Intent).\n` +
          `  Every Quest must trace its lineage to a sovereign human Intent.\n` +
          `  Declare one first: xyph-actuator intent <id> --title "..." --requested-by human.<name>`,
        );
      }
      assertPrefix(intentId, 'intent:', '--intent value');

      const graph = await ctx.graphPort.getGraph();
      const sha = await graph.patch((p) => {
        p.addNode(id)
          .setProperty(id, 'title', opts.title)
          .setProperty(id, 'status', 'PLANNED')
          .setProperty(id, 'hours', opts.hours ?? 0)
          .setProperty(id, 'priority', priority)
          .setProperty(id, 'task_kind', taskKind)
          .setProperty(id, 'type', 'task');
        if (opts.description !== undefined) {
          p.setProperty(id, 'description', opts.description.trim());
        }

        if (opts.campaign !== 'none') {
          p.addEdge(id, opts.campaign, 'belongs-to');
        }
        p.addEdge(id, intentId, 'authorized-by');
      });

      if (ctx.json) {
        ctx.jsonOut({
          success: true, command: 'quest',
          data: {
            id,
            title: opts.title,
            status: 'PLANNED',
            campaign: opts.campaign,
            intent: intentId,
            description: opts.description?.trim() ?? null,
            priority,
            taskKind,
            hours: opts.hours ?? 0,
            patch: sha,
          },
        });
        return;
      }

      const campaignNote = opts.campaign === 'none' ? '(no campaign)' : `in campaign ${opts.campaign}`;
      ctx.ok(`[OK] Quest ${id} initialized ${campaignNote}. Patch: ${sha}`);
    }));
}
