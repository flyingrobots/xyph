/**
 * Suggestion lifecycle CLI commands — suggestion accept, suggestion reject, suggestion accept-all.
 *
 * Namespaced under `suggestion` parent command to avoid collision with
 * intake's `reject` command.
 *
 * Part of M11 Phase 4 — ALK-003.
 */

import type { Command } from 'commander';
import type { CliContext } from '../context.js';
import { createErrorHandler } from '../errorHandler.js';
import { assertPrefix } from '../validators.js';

export function registerSuggestionCommands(program: Command, ctx: CliContext): void {
  const withErrorHandler = createErrorHandler(ctx);

  const suggestionCmd = program
    .command('suggestion')
    .description('Manage auto-linking suggestions');

  // --- suggestion accept: materialize a suggestion into a real evidence + edge ---
  suggestionCmd
    .command('accept <id>')
    .description('Accept a suggestion — materializes evidence + verifies/implements edge')
    .option('--rationale <text>', 'Why this suggestion is correct')
    .action(withErrorHandler(async (id: string, opts: { rationale?: string }) => {
      assertPrefix(id, 'suggestion:', 'Suggestion ID');

      const graph = await ctx.graphPort.getGraph();

      if (!await graph.hasNode(id)) {
        throw new Error(`[NOT_FOUND] Suggestion ${id} not found in the graph`);
      }

      const props = await graph.getNodeProps(id);
      if (!props) throw new Error(`[NOT_FOUND] Suggestion ${id} has no properties`);

      const status = props.get('status');
      if (status !== 'PENDING') {
        throw new Error(`[INVALID_STATE] Suggestion ${id} is ${String(status)}, not PENDING`);
      }

      const targetId = props.get('target_id');
      const targetType = props.get('target_type');
      const testFile = props.get('test_file');
      const confidence = props.get('confidence');

      if (typeof targetId !== 'string' || typeof targetType !== 'string' || typeof testFile !== 'string') {
        throw new Error(`[CORRUPT] Suggestion ${id} is missing required properties`);
      }

      const now = Date.now();
      const evidenceId = `evidence:auto-${id.replace('suggestion:', '')}`;
      const edgeType = targetType === 'criterion' ? 'verifies' as const : 'implements' as const;

      const sha = await graph.patch((p) => {
        // Create evidence node
        p.addNode(evidenceId)
          .setProperty(evidenceId, 'kind', 'test')
          .setProperty(evidenceId, 'result', 'pass')
          .setProperty(evidenceId, 'produced_at', now)
          .setProperty(evidenceId, 'produced_by', ctx.agentId)
          .setProperty(evidenceId, 'type', 'evidence')
          .setProperty(evidenceId, 'source_file', testFile)
          .setProperty(evidenceId, 'auto_confidence', typeof confidence === 'number' ? confidence : 0);

        // Create edge
        p.addEdge(evidenceId, targetId, edgeType);

        // Update suggestion status
        p.setProperty(id, 'status', 'ACCEPTED')
          .setProperty(id, 'resolved_by', ctx.agentId)
          .setProperty(id, 'resolved_at', now);

        if (opts.rationale) {
          p.setProperty(id, 'rationale', opts.rationale);
        }
      });

      if (ctx.json) {
        ctx.jsonOut({
          success: true, command: 'suggestion accept',
          data: {
            suggestionId: id, evidenceId, targetId, edgeType,
            rationale: opts.rationale ?? null, patch: sha,
          },
        });
        return;
      }

      ctx.ok(`[OK] Accepted ${id} → created ${evidenceId} ${edgeType} ${targetId}. Patch: ${sha.slice(0, 7)}`);
    }));

  // --- suggestion reject: mark suggestion as REJECTED ---
  suggestionCmd
    .command('reject <id>')
    .description('Reject a suggestion — prevents re-suggestion')
    .requiredOption('--rationale <text>', 'Why this suggestion is incorrect')
    .action(withErrorHandler(async (id: string, opts: { rationale: string }) => {
      assertPrefix(id, 'suggestion:', 'Suggestion ID');

      const graph = await ctx.graphPort.getGraph();

      if (!await graph.hasNode(id)) {
        throw new Error(`[NOT_FOUND] Suggestion ${id} not found in the graph`);
      }

      const props = await graph.getNodeProps(id);
      if (!props) throw new Error(`[NOT_FOUND] Suggestion ${id} has no properties`);

      const status = props.get('status');
      if (status !== 'PENDING') {
        throw new Error(`[INVALID_STATE] Suggestion ${id} is ${String(status)}, not PENDING`);
      }

      const now = Date.now();

      const sha = await graph.patch((p) => {
        p.setProperty(id, 'status', 'REJECTED')
          .setProperty(id, 'rationale', opts.rationale)
          .setProperty(id, 'resolved_by', ctx.agentId)
          .setProperty(id, 'resolved_at', now);
      });

      if (ctx.json) {
        ctx.jsonOut({
          success: true, command: 'suggestion reject',
          data: { suggestionId: id, rationale: opts.rationale, patch: sha },
        });
        return;
      }

      ctx.ok(`[OK] Rejected ${id}. Patch: ${sha.slice(0, 7)}`);
    }));

  // --- suggestion accept-all: batch accept suggestions above a threshold ---
  suggestionCmd
    .command('accept-all')
    .description('Batch-accept all PENDING suggestions above a confidence threshold')
    .option('--min-confidence <n>', 'Minimum confidence to accept', '0.85')
    .action(withErrorHandler(async (opts: { minConfidence: string }) => {
      const minConf = Number(opts.minConfidence);
      if (!Number.isFinite(minConf) || minConf < 0 || minConf > 1) {
        throw new Error(`--min-confidence must be a number between 0 and 1, got: '${opts.minConfidence}'`);
      }

      const { createGraphContext } = await import('../../infrastructure/GraphContext.js');
      const graphCtx = createGraphContext(ctx.graphPort);
      const snapshot = await graphCtx.fetchSnapshot();

      const pending = snapshot.suggestions.filter(
        (s) => s.status === 'PENDING' && s.confidence >= minConf,
      );

      if (pending.length === 0) {
        if (ctx.json) {
          ctx.jsonOut({
            success: true, command: 'suggestion accept-all',
            data: { accepted: 0, minConfidence: minConf },
          });
          return;
        }
        ctx.muted(`No PENDING suggestions above ${minConf} confidence.`);
        return;
      }

      const graph = await ctx.graphPort.getGraph();
      const now = Date.now();
      let accepted = 0;

      for (const s of pending) {
        const evidenceId = `evidence:auto-${s.id.replace('suggestion:', '')}`;
        const edgeType = s.targetType === 'criterion' ? 'verifies' as const : 'implements' as const;

        await graph.patch((p) => {
          p.addNode(evidenceId)
            .setProperty(evidenceId, 'kind', 'test')
            .setProperty(evidenceId, 'result', 'pass')
            .setProperty(evidenceId, 'produced_at', now)
            .setProperty(evidenceId, 'produced_by', ctx.agentId)
            .setProperty(evidenceId, 'type', 'evidence')
            .setProperty(evidenceId, 'source_file', s.testFile)
            .setProperty(evidenceId, 'auto_confidence', s.confidence);

          p.addEdge(evidenceId, s.targetId, edgeType);

          p.setProperty(s.id, 'status', 'ACCEPTED')
            .setProperty(s.id, 'resolved_by', ctx.agentId)
            .setProperty(s.id, 'resolved_at', now);
        });

        accepted++;

        if (!ctx.json) {
          ctx.muted(`  ${s.id} → ${evidenceId} ${edgeType} ${s.targetId} (${s.confidence})`);
        }
      }

      if (ctx.json) {
        ctx.jsonOut({
          success: true, command: 'suggestion accept-all',
          data: {
            accepted,
            minConfidence: minConf,
            ids: pending.map((s) => s.id),
          },
        });
        return;
      }

      ctx.ok(`[OK] Accepted ${accepted} suggestion(s) above ${minConf} confidence.`);
    }));
}
