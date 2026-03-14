import type { Command } from 'commander';
import type { CliContext } from '../context.js';
import { createErrorHandler } from '../errorHandler.js';
import { renderDiagnosticsLines } from '../renderDiagnostics.js';
import { assertMinLength, assertNodeExists, assertPrefix } from '../validators.js';
import { createPatchSession } from '../../infrastructure/helpers/createPatchSession.js';
import type { ReadinessAssessment } from '../../domain/services/ReadinessService.js';
import type {
  CommentNode,
  EntityDetail,
  NarrativeNode,
  QuestDetail,
  QuestTimelineEntry,
} from '../../domain/models/dashboard.js';
import type { Diagnostic } from '../../domain/models/diagnostics.js';
import { collectQuestDiagnostics } from '../../domain/services/DiagnosticService.js';

interface NarrativeWriteOptions {
  on: string;
  title?: string;
  body?: string;
  supersedes?: string;
}

function renderGenericEntity(detail: EntityDetail): string {
  const lines: string[] = [];
  lines.push(`${detail.id}  [${detail.type}]`);

  const propKeys = Object.keys(detail.props).sort();
  if (propKeys.length > 0) {
    lines.push('');
    lines.push('Properties');
    for (const key of propKeys) {
      lines.push(`  ${key}: ${JSON.stringify(detail.props[key])}`);
    }
  }

  if (detail.content) {
    lines.push('');
    lines.push('Content');
    for (const line of detail.content.trimEnd().split('\n')) {
      lines.push(`  ${line}`);
    }
  }

  if (detail.outgoing.length > 0) {
    lines.push('');
    lines.push('Outgoing');
    for (const edge of detail.outgoing) {
      lines.push(`  - ${edge.label} -> ${edge.nodeId}`);
    }
  }

  if (detail.incoming.length > 0) {
    lines.push('');
    lines.push('Incoming');
    for (const edge of detail.incoming) {
      lines.push(`  - ${edge.label} <- ${edge.nodeId}`);
    }
  }

  return lines.join('\n');
}

function firstLine(text: string | undefined): string {
  if (!text) return '';
  return text.split('\n')[0]?.trim() ?? '';
}

function renderNarrativeLines(label: string, entries: NarrativeNode[] | CommentNode[]): string[] {
  if (entries.length === 0) return [];

  const lines = ['', label];
  for (const entry of entries) {
    if ('title' in entry) {
      const state = entry.current ? 'current' : 'history';
      const typeLabel = entry.type === 'note' && entry.noteKind
        ? `${entry.type}:${entry.noteKind}`
        : entry.type;
      lines.push(`  - ${entry.id} [${typeLabel}] ${entry.title} (${state})`);
      if (entry.targetIds.length > 0) {
        lines.push(`      targets: ${entry.targetIds.join(', ')}`);
      }
      if (entry.supersedesId) {
        lines.push(`      supersedes: ${entry.supersedesId}`);
      }
      if (entry.body) {
        lines.push(`      ${firstLine(entry.body)}`);
      }
    } else {
      const relation = entry.replyToId ? `reply to ${entry.replyToId}` : (entry.targetId ? `on ${entry.targetId}` : 'comment');
      lines.push(`  - ${entry.id} (${relation})`);
      if (entry.body) {
        lines.push(`      ${firstLine(entry.body)}`);
      }
    }
  }
  return lines;
}

function renderTimeline(entries: QuestTimelineEntry[]): string[] {
  if (entries.length === 0) return [];
  const lines = ['', 'Timeline'];
  for (const entry of entries) {
    const actor = entry.actor ? ` by ${entry.actor}` : '';
    const related = entry.relatedId ? ` [${entry.relatedId}]` : '';
    lines.push(`  - ${new Date(entry.at).toISOString()}  ${entry.kind}${actor}: ${entry.title}${related}`);
  }
  return lines;
}

function renderQuestDetail(
  detail: QuestDetail,
  readiness?: ReadinessAssessment,
  diagnostics: Diagnostic[] = [],
): string {
  const lines: string[] = [];
  const { quest } = detail;

  lines.push(`${quest.id}  ${quest.title}  [${quest.status}]`);
  lines.push(`kind: ${quest.taskKind ?? 'delivery'}   hours: ${quest.hours}`);
  if (quest.description) {
    lines.push('');
    lines.push(quest.description);
  }

  lines.push('');
  lines.push('Context');
  lines.push(`  campaign: ${detail.campaign?.id ?? '—'}`);
  lines.push(`  intent: ${detail.intent?.id ?? '—'}`);
  lines.push(`  assigned: ${quest.assignedTo ?? '—'}`);
  lines.push(`  readyAt: ${quest.readyAt ? new Date(quest.readyAt).toISOString() : '—'}`);
  if ((quest.dependsOn?.length ?? 0) > 0) {
    lines.push(`  dependsOn: ${quest.dependsOn?.join(', ')}`);
  }
  if (readiness) {
    const readinessLabel = readiness.valid
      ? (quest.status === 'PLANNED' ? 'READYABLE' : 'CONTRACT SATISFIED')
      : 'NOT READY';
    lines.push(`  readiness: ${readinessLabel}`);
    if (!readiness.valid && readiness.unmet.length > 0) {
      for (const unmet of readiness.unmet) {
        lines.push(`    - ${unmet.message}`);
      }
    }
  }

  lines.push('');
  lines.push('Traceability');
  lines.push(`  stories: ${detail.stories.length}`);
  lines.push(`  requirements: ${detail.requirements.length}`);
  lines.push(`  criteria: ${detail.criteria.length}`);
  lines.push(`  evidence: ${detail.evidence.length}`);
  lines.push(`  policies: ${detail.policies.length}`);
  if (quest.computedCompletion) {
    lines.push('');
    lines.push('Computed Completion');
    lines.push(`  verdict: ${quest.computedCompletion.verdict}`);
    lines.push(`  complete: ${quest.computedCompletion.complete ? 'yes' : 'no'}`);
    lines.push(`  tracked: ${quest.computedCompletion.tracked ? 'yes' : 'no'}`);
    lines.push(`  coverage: ${Math.round(quest.computedCompletion.coverageRatio * 100)}%`);
    if (quest.computedCompletion.policyId) {
      lines.push(`  policy: ${quest.computedCompletion.policyId}`);
    }
    if (quest.computedCompletion.discrepancy) {
      lines.push(`  discrepancy: ${quest.computedCompletion.discrepancy}`);
    }
  }

  if (detail.submission) {
    lines.push('');
    lines.push('Settlement');
    lines.push(`  submission: ${detail.submission.id} (${detail.submission.status})`);
    lines.push(`  reviews: ${detail.reviews.length}`);
    lines.push(`  decisions: ${detail.decisions.length}`);
    lines.push(`  scroll: ${detail.scroll?.id ?? '—'}`);
  }

  lines.push(...renderNarrativeLines('Documents', detail.documents));
  lines.push(...renderNarrativeLines('Comments', detail.comments));
  lines.push(...renderDiagnosticsLines(diagnostics));
  lines.push(...renderTimeline(detail.timeline));

  return lines.join('\n');
}

async function commitNarrativeNode(
  ctx: CliContext,
  kind: 'spec' | 'adr' | 'note',
  id: string,
  opts: NarrativeWriteOptions,
): Promise<{ patch: string; contentOid?: string }> {
  assertPrefix(id, `${kind}:`, 'ID');
  assertMinLength(opts.on, 3, '--on');
  assertMinLength(opts.title ?? '', 3, '--title');
  assertMinLength(opts.body ?? '', 5, '--body');
  const title = opts.title?.trim();
  const body = opts.body?.trim();
  if (!title || !body) {
    throw new Error(`[INVALID_ARGS] ${kind} requires both --title and --body`);
  }

  const graph = await ctx.graphPort.getGraph();
  await assertNodeExists(graph, opts.on, 'Target');
  if (opts.supersedes) {
    assertPrefix(opts.supersedes, `${kind}:`, '--supersedes');
    await assertNodeExists(graph, opts.supersedes, 'Superseded document');
  }

  const patch = await createPatchSession(graph);
  const now = Date.now();
  patch
    .addNode(id)
    .setProperty(id, 'type', kind)
    .setProperty(id, 'title', title)
    .setProperty(id, 'authored_by', ctx.agentId)
    .setProperty(id, 'authored_at', now)
    .addEdge(id, opts.on, 'documents');
  if (opts.supersedes) {
    patch.addEdge(id, opts.supersedes, 'supersedes');
  }
  await patch.attachContent(id, body);
  const sha = await patch.commit();
  const contentOid = await graph.getContentOid(id) ?? undefined;
  return { patch: sha, contentOid };
}

export function registerShowCommands(program: Command, ctx: CliContext): void {
  const withErrorHandler = createErrorHandler(ctx);

  program
    .command('show <id>')
    .description('Inspect a graph entity; task:* renders a quest detail projection')
    .action(withErrorHandler(async (id: string) => {
      const { createGraphContext } = await import('../../infrastructure/GraphContext.js');
      const graphCtx = createGraphContext(ctx.graphPort);
      const detail = await graphCtx.fetchEntityDetail(id);
      if (!detail) {
        throw new Error(`[NOT_FOUND] Node ${id} not found in the graph`);
      }
      let readiness: ReadinessAssessment | null = null;
      let diagnostics: Diagnostic[] = [];
      if (detail.questDetail) {
        const { WarpRoadmapAdapter } = await import('../../infrastructure/adapters/WarpRoadmapAdapter.js');
        const { ReadinessService } = await import('../../domain/services/ReadinessService.js');
        readiness = await new ReadinessService(new WarpRoadmapAdapter(ctx.graphPort)).assess(id, { transition: false });
        diagnostics = collectQuestDiagnostics(detail.questDetail, readiness);
      }

      if (ctx.json) {
        ctx.jsonOut({
          success: true,
          command: 'show',
          diagnostics,
          data: {
            id: detail.id,
            type: detail.type,
            props: detail.props,
            content: detail.content ?? null,
            contentOid: detail.contentOid ?? null,
            outgoing: detail.outgoing,
            incoming: detail.incoming,
            questDetail: detail.questDetail ?? null,
            readiness: readiness ?? null,
          },
        });
        return;
      }

      ctx.print(detail.questDetail
        ? renderQuestDetail(detail.questDetail, readiness ?? undefined, diagnostics)
        : renderGenericEntity(detail));
    }));

  program
    .command('comment <id>')
    .description('Attach an append-only comment to a graph entity')
    .requiredOption('--on <node>', 'Target node ID')
    .requiredOption('--message <text>', 'Comment body')
    .option('--reply-to <commentId>', 'Reply to an existing comment')
    .action(withErrorHandler(async (id: string, opts: { on: string; message: string; replyTo?: string }) => {
      assertPrefix(id, 'comment:', 'Comment ID');
      assertMinLength(opts.on, 3, '--on');
      assertMinLength(opts.message.trim(), 1, '--message');

      const graph = await ctx.graphPort.getGraph();
      await assertNodeExists(graph, opts.on, 'Target');
      if (opts.replyTo) {
        assertPrefix(opts.replyTo, 'comment:', '--reply-to');
        await assertNodeExists(graph, opts.replyTo, 'Reply target');
      }

      const patch = await createPatchSession(graph);
      const now = Date.now();
      patch
        .addNode(id)
        .setProperty(id, 'type', 'comment')
        .setProperty(id, 'authored_by', ctx.agentId)
        .setProperty(id, 'authored_at', now)
        .addEdge(id, opts.on, 'comments-on');
      if (opts.replyTo) {
        patch.addEdge(id, opts.replyTo, 'replies-to');
      }
      await patch.attachContent(id, opts.message.trim());
      const sha = await patch.commit();
      const contentOid = await graph.getContentOid(id) ?? undefined;

      if (ctx.json) {
        ctx.jsonOut({
          success: true,
          command: 'comment',
          data: {
            id,
            on: opts.on,
            replyTo: opts.replyTo ?? null,
            authoredBy: ctx.agentId,
            authoredAt: now,
            contentOid: contentOid ?? null,
            patch: sha,
          },
        });
        return;
      }

      ctx.ok(`[OK] Comment ${id} attached to ${opts.on}.`);
      ctx.muted(`  Patch: ${sha}`);
    }));

  program
    .command('note <id>')
    .description('Create a graph-native note node with attached body content')
    .requiredOption('--on <node>', 'Target node ID')
    .requiredOption('--title <text>', 'Short note title')
    .requiredOption('--body <text>', 'Note body')
    .option('--supersedes <id>', 'Prior note revision')
    .action(withErrorHandler(async (id: string, opts: NarrativeWriteOptions) => {
      const result = await commitNarrativeNode(ctx, 'note', id, opts);
      if (ctx.json) {
        ctx.jsonOut({
          success: true,
          command: 'note',
          data: {
            id,
            on: opts.on,
            title: opts.title?.trim() ?? null,
            supersedes: opts.supersedes ?? null,
            authoredBy: ctx.agentId,
            contentOid: result.contentOid ?? null,
            patch: result.patch,
          },
        });
        return;
      }
      ctx.ok(`[OK] Note ${id} linked to ${opts.on}.`);
      ctx.muted(`  Patch: ${result.patch}`);
    }));

  program
    .command('spec <id>')
    .description('Create a graph-native spec node with attached body content')
    .requiredOption('--on <node>', 'Target node ID')
    .requiredOption('--title <text>', 'Short spec title')
    .requiredOption('--body <text>', 'Spec body')
    .option('--supersedes <id>', 'Prior spec revision')
    .action(withErrorHandler(async (id: string, opts: NarrativeWriteOptions) => {
      const result = await commitNarrativeNode(ctx, 'spec', id, opts);
      if (ctx.json) {
        ctx.jsonOut({
          success: true,
          command: 'spec',
          data: {
            id,
            on: opts.on,
            title: opts.title?.trim() ?? null,
            supersedes: opts.supersedes ?? null,
            authoredBy: ctx.agentId,
            contentOid: result.contentOid ?? null,
            patch: result.patch,
          },
        });
        return;
      }
      ctx.ok(`[OK] Spec ${id} linked to ${opts.on}.`);
      ctx.muted(`  Patch: ${result.patch}`);
    }));

  program
    .command('adr <id>')
    .description('Create a graph-native ADR node with attached body content')
    .requiredOption('--on <node>', 'Target node ID')
    .requiredOption('--title <text>', 'Short ADR title')
    .requiredOption('--body <text>', 'ADR body')
    .option('--supersedes <id>', 'Prior ADR revision')
    .action(withErrorHandler(async (id: string, opts: NarrativeWriteOptions) => {
      const result = await commitNarrativeNode(ctx, 'adr', id, opts);
      if (ctx.json) {
        ctx.jsonOut({
          success: true,
          command: 'adr',
          data: {
            id,
            on: opts.on,
            title: opts.title?.trim() ?? null,
            supersedes: opts.supersedes ?? null,
            authoredBy: ctx.agentId,
            contentOid: result.contentOid ?? null,
            patch: result.patch,
          },
        });
        return;
      }
      ctx.ok(`[OK] ADR ${id} linked to ${opts.on}.`);
      ctx.muted(`  Patch: ${result.patch}`);
    }));
}
