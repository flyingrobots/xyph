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
import { assertPrefix, assertNodeExists } from '../validators.js';
import { RecordService } from '../../domain/services/RecordService.js';
import {
  VALID_AI_SUGGESTION_ADOPTION_KINDS,
  VALID_AI_SUGGESTION_AUDIENCES,
  VALID_AI_SUGGESTION_KINDS,
  VALID_AI_SUGGESTION_STATUSES,
  type AiSuggestionAudience,
  type AiSuggestionAdoptionKind,
  type AiSuggestionKind,
  type AiSuggestionStatus,
  defaultAiSuggestionAdoptionKind,
} from '../../domain/entities/AiSuggestion.js';

function aiSuggestionOrigin(opts: { kind: string; requestedBy?: string }): 'request' | 'spontaneous' {
  if (opts.kind === 'ask-ai') return 'request';
  return opts.requestedBy ? 'request' : 'spontaneous';
}

function aiSuggestionStatus(opts: { kind: string; status: string }): AiSuggestionStatus {
  if (opts.kind === 'ask-ai' && opts.status === 'suggested') {
    return 'queued';
  }
  return opts.status as AiSuggestionStatus;
}

function aiSuggestionAudience(opts: { kind: string; audience: string }): AiSuggestionAudience {
  if (opts.kind === 'ask-ai' && opts.audience === 'either') {
    return 'agent';
  }
  return opts.audience as AiSuggestionAudience;
}

export function registerSuggestionCommands(program: Command, ctx: CliContext): void {
  const withErrorHandler = createErrorHandler(ctx);
  const records = new RecordService(ctx.graphPort);

  program
    .command('suggest')
    .description('Record an AI suggestion as a visible advisory artifact')
    .requiredOption('--kind <kind>', 'ask-ai | quest | dependency | promotion | campaign | intent | governance | reopen | general')
    .requiredOption('--title <text>', 'Short suggestion title')
    .requiredOption('--summary <text>', 'What is being suggested and why it matters')
    .option('--for <audience>', 'human | agent | either', 'either')
    .option('--status <status>', 'suggested | queued | accepted | rejected | implemented', 'suggested')
    .option('--target <id>', 'Primary target entity ID')
    .option('--related <ids...>', 'Related entity IDs')
    .option('--requested-by <principal>', 'Principal that explicitly requested the suggestion')
    .option('--why <text>', 'Why the suggestion is worth considering')
    .option('--evidence <text>', 'Supporting evidence for the suggestion')
    .option('--next <text>', 'Recommended next action if the suggestion is accepted')
    .option('--id <id>', 'Explicit suggestion ID (must use the suggestion: prefix)')
    .option('--idempotency-key <key>', 'Stable idempotency key for repeatable suggestion emission')
    .action(withErrorHandler(async (opts: {
      kind: string;
      title: string;
      summary: string;
      for: string;
      status: string;
      target?: string;
      related?: string[];
      requestedBy?: string;
      why?: string;
      evidence?: string;
      next?: string;
      id?: string;
      idempotencyKey?: string;
    }) => {
      const kind = opts.kind.trim().toLowerCase();
      const audience = opts.for.trim().toLowerCase();
      const status = opts.status.trim().toLowerCase();
      const title = opts.title.trim();
      const summary = opts.summary.trim();

      if (!VALID_AI_SUGGESTION_KINDS.has(kind)) {
        throw new Error(`[INVALID_ARGS] --kind must be one of ${[...VALID_AI_SUGGESTION_KINDS].join(', ')}`);
      }
      if (!VALID_AI_SUGGESTION_AUDIENCES.has(audience)) {
        throw new Error(`[INVALID_ARGS] --for must be one of ${[...VALID_AI_SUGGESTION_AUDIENCES].join(', ')}`);
      }
      if (!VALID_AI_SUGGESTION_STATUSES.has(status)) {
        throw new Error(`[INVALID_ARGS] --status must be one of ${[...VALID_AI_SUGGESTION_STATUSES].join(', ')}`);
      }
      if (title.length < 4) {
        throw new Error('[INVALID_ARGS] --title must be at least 4 characters');
      }
      if (summary.length < 8) {
        throw new Error('[INVALID_ARGS] --summary must be at least 8 characters');
      }
      if (opts.id) {
        assertPrefix(opts.id, 'suggestion:', 'Suggestion ID');
      }

      const resolvedAudience = aiSuggestionAudience({ kind, audience });
      const resolvedStatus = aiSuggestionStatus({ kind, status });
      const resolvedOrigin = aiSuggestionOrigin({ kind, requestedBy: opts.requestedBy });
      const resolvedRequestedBy = kind === 'ask-ai'
        ? (opts.requestedBy ?? ctx.agentId)
        : opts.requestedBy;
      if (kind === 'ask-ai' && resolvedAudience === 'human') {
        throw new Error('[INVALID_ARGS] ask-ai jobs must target agent or either, never human-only');
      }
      const resolvedNextAction = kind === 'ask-ai'
        ? (opts.next ?? 'An agent should inspect this ask-AI job and publish one or more visible advisory suggestions in response.')
        : opts.next;

      const result = await records.createAiSuggestion({
        id: opts.id,
        idempotencyKey: opts.idempotencyKey,
        kind: kind as AiSuggestionKind,
        title,
        summary,
        suggestedBy: ctx.agentId,
        audience: resolvedAudience,
        origin: resolvedOrigin,
        status: resolvedStatus,
        targetId: opts.target,
        relatedIds: opts.related ?? [],
        requestedBy: resolvedRequestedBy,
        why: opts.why,
        evidence: opts.evidence,
        nextAction: resolvedNextAction,
      });

      if (ctx.json) {
        ctx.jsonOut({
          success: true,
          command: 'suggest',
          data: {
            id: result.id,
            kind,
            title,
            summary,
            audience: resolvedAudience,
            origin: resolvedOrigin,
            status: resolvedStatus,
            targetId: opts.target ?? null,
            relatedIds: opts.related ?? [],
            requestedBy: resolvedRequestedBy ?? null,
            patch: result.patch,
            suggestedAt: result.suggestedAt,
            contentOid: result.contentOid,
          },
        });
        return;
      }

      ctx.ok(`[AI] Suggestion ${result.id} recorded. Patch: ${result.patch}`);
    }));

  program
    .command('ask-ai')
    .description('Queue an explicit ask-AI job for agent pickup')
    .requiredOption('--title <text>', 'Short ask-AI job title')
    .requiredOption('--summary <text>', 'What the agent should investigate, recommend, or explain')
    .option('--target <id>', 'Primary target entity ID')
    .option('--related <ids...>', 'Related entity IDs')
    .option('--requested-by <principal>', 'Principal requesting the AI follow-up')
    .option('--why <text>', 'Why the request matters right now')
    .option('--evidence <text>', 'Supporting evidence or context for the request')
    .option('--next <text>', 'Recommended response shape or next action')
    .option('--for <audience>', 'agent | either', 'agent')
    .option('--id <id>', 'Explicit suggestion ID (must use the suggestion: prefix)')
    .option('--idempotency-key <key>', 'Stable idempotency key for repeatable ask-AI job creation')
    .action(withErrorHandler(async (opts: {
      title: string;
      summary: string;
      target?: string;
      related?: string[];
      requestedBy?: string;
      why?: string;
      evidence?: string;
      next?: string;
      for: string;
      id?: string;
      idempotencyKey?: string;
    }) => {
      const title = opts.title.trim();
      const summary = opts.summary.trim();
      const audience = opts.for.trim().toLowerCase();
      if (!(audience === 'agent' || audience === 'either')) {
        throw new Error('[INVALID_ARGS] --for must be either agent or either for ask-ai jobs');
      }
      if (title.length < 4) {
        throw new Error('[INVALID_ARGS] --title must be at least 4 characters');
      }
      if (summary.length < 8) {
        throw new Error('[INVALID_ARGS] --summary must be at least 8 characters');
      }
      if (opts.id) {
        assertPrefix(opts.id, 'suggestion:', 'Suggestion ID');
      }

      const requestedBy = opts.requestedBy ?? ctx.agentId;
      const nextAction = opts.next
        ?? 'An agent should inspect this ask-AI job and publish one or more visible advisory suggestions in response.';

      const result = await records.createAiSuggestion({
        id: opts.id,
        idempotencyKey: opts.idempotencyKey,
        kind: 'ask-ai',
        title,
        summary,
        suggestedBy: ctx.agentId,
        audience: audience as AiSuggestionAudience,
        origin: 'request',
        status: 'queued',
        targetId: opts.target,
        relatedIds: opts.related ?? [],
        requestedBy,
        why: opts.why,
        evidence: opts.evidence,
        nextAction,
      });

      if (ctx.json) {
        ctx.jsonOut({
          success: true,
          command: 'ask-ai',
          data: {
            id: result.id,
            kind: 'ask-ai',
            title,
            summary,
            audience,
            origin: 'request',
            status: 'queued',
            targetId: opts.target ?? null,
            relatedIds: opts.related ?? [],
            requestedBy,
            patch: result.patch,
            suggestedAt: result.suggestedAt,
            contentOid: result.contentOid,
          },
        });
        return;
      }

      ctx.ok(`[AI] Ask-AI job ${result.id} queued. Patch: ${result.patch}`);
    }));

  const suggestionCmd = program
    .command('suggestion')
    .description('Manage suggestion artifacts');

  // --- suggestion accept: adopt AI suggestions into governed work, or accept legacy auto-link suggestions ---
  suggestionCmd
    .command('accept <id>')
    .description('Accept a suggestion')
    .option('--as <kind>', 'proposal | quest')
    .option('--rationale <text>', 'Why this suggestion is correct')
    .action(withErrorHandler(async (id: string, opts: { as?: string; rationale?: string }) => {
      assertPrefix(id, 'suggestion:', 'Suggestion ID');

      const graph = await ctx.graphPort.getGraph();

      await assertNodeExists(graph, id, 'Suggestion');

      const props = await graph.getNodeProps(id);
      if (!props) throw new Error(`[NOT_FOUND] Suggestion ${id} has no properties`);

      if (props['type'] === 'ai_suggestion') {
        const suggestionKind = typeof props['suggestion_kind'] === 'string'
          ? props['suggestion_kind'] as AiSuggestionKind
          : 'general';
        const adoptedArtifactKindRaw = opts.as?.trim().toLowerCase();
        if (adoptedArtifactKindRaw && !VALID_AI_SUGGESTION_ADOPTION_KINDS.has(adoptedArtifactKindRaw)) {
          throw new Error(`[INVALID_ARGS] --as must be one of ${[...VALID_AI_SUGGESTION_ADOPTION_KINDS].join(', ')}`);
        }
        const adoptedArtifactKind = (adoptedArtifactKindRaw as AiSuggestionAdoptionKind | undefined)
          ?? defaultAiSuggestionAdoptionKind(suggestionKind);
        const rationale = opts.rationale?.trim() ?? '';
        if (!rationale) {
          throw new Error('[INVALID_ARGS] --rationale must be non-empty');
        }
        const result = await records.adoptAiSuggestion({
          suggestionId: id,
          resolvedBy: ctx.agentId,
          adoptedArtifactKind,
          rationale,
        });

        const targetId = typeof props['target_id'] === 'string' ? props['target_id'] : null;

        if (ctx.json) {
          ctx.jsonOut({
            success: true,
            command: 'suggestion accept',
            data: {
              suggestionId: id,
              adoptedArtifactId: result.adoptedArtifactId,
              adoptedArtifactKind: result.adoptedArtifactKind,
              targetId,
              rationale,
              patch: result.patch,
            },
          });
          return;
        }

        ctx.ok(`[OK] Adopted ${id} into ${result.adoptedArtifactKind} ${result.adoptedArtifactId}. Patch: ${result.patch.slice(0, 7)}`);
        return;
      }

      const status = props['status'];
      if (status !== 'PENDING') {
        throw new Error(`[INVALID_STATE] Suggestion ${id} is ${String(status)}, not PENDING`);
      }

      const targetId = props['target_id'];
      const targetType = props['target_type'];
      const testFile = props['test_file'];
      const confidence = props['confidence'];

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
          .setProperty(evidenceId, 'result', 'linked')
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

      ctx.ok(`[OK] Accepted ${id} → created linked ${evidenceId} ${edgeType} ${targetId}. Patch: ${sha.slice(0, 7)}`);
    }));

  // --- suggestion dismiss: reject an AI suggestion with visible rationale ---
  suggestionCmd
    .command('dismiss <id>')
    .description('Dismiss an AI suggestion with recorded rationale')
    .requiredOption('--rationale <text>', 'Why this suggestion should not be adopted')
    .action(withErrorHandler(async (id: string, opts: { rationale: string }) => {
      assertPrefix(id, 'suggestion:', 'Suggestion ID');

      const result = await records.dismissAiSuggestion({
        suggestionId: id,
        resolvedBy: ctx.agentId,
        rationale: opts.rationale,
      });

      if (ctx.json) {
        ctx.jsonOut({
          success: true,
          command: 'suggestion dismiss',
          data: {
            suggestionId: id,
            status: 'rejected',
            resolutionKind: 'dismissed',
            rationale: opts.rationale,
            patch: result.patch,
          },
        });
        return;
      }

      ctx.ok(`[OK] Dismissed ${id}. Patch: ${result.patch.slice(0, 7)}`);
    }));

  suggestionCmd
    .command('supersede <id>')
    .description('Mark an AI suggestion superseded by a newer artifact')
    .requiredOption('--by <id>', 'Replacement suggestion or artifact ID')
    .requiredOption('--rationale <text>', 'Why the replacement supersedes this suggestion')
    .action(withErrorHandler(async (id: string, opts: { by: string; rationale: string }) => {
      assertPrefix(id, 'suggestion:', 'Suggestion ID');
      const rationale = opts.rationale.trim();
      if (!rationale) {
        throw new Error('[INVALID_ARGS] --rationale must be non-empty');
      }

      const result = await records.supersedeAiSuggestion({
        suggestionId: id,
        supersededById: opts.by,
        resolvedBy: ctx.agentId,
        rationale,
      });

      if (ctx.json) {
        ctx.jsonOut({
          success: true,
          command: 'suggestion supersede',
          data: {
            suggestionId: id,
            status: 'rejected',
            resolutionKind: 'superseded',
            supersededById: result.supersededById,
            rationale,
            patch: result.patch,
          },
        });
        return;
      }

      ctx.ok(`[OK] Marked ${id} superseded by ${result.supersededById}. Patch: ${result.patch.slice(0, 7)}`);
    }));

  // --- suggestion reject: mark suggestion as REJECTED ---
  suggestionCmd
    .command('reject <id>')
    .description('Reject a suggestion — prevents re-suggestion')
    .requiredOption('--rationale <text>', 'Why this suggestion is incorrect')
    .action(withErrorHandler(async (id: string, opts: { rationale: string }) => {
      assertPrefix(id, 'suggestion:', 'Suggestion ID');

      const graph = await ctx.graphPort.getGraph();

      await assertNodeExists(graph, id, 'Suggestion');

      const props = await graph.getNodeProps(id);
      if (!props) throw new Error(`[NOT_FOUND] Suggestion ${id} has no properties`);

      const status = props['status'];
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
      const snapshot = await graphCtx.fetchSnapshot(undefined, { profile: 'analysis' });

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

      interface AcceptInfo { suggestionId: string; evidenceId: string; edgeType: 'verifies' | 'implements'; targetId: string; confidence: number }
      const acceptInfos: AcceptInfo[] = [];

      await graph.patch((p) => {
        for (const s of pending) {
          const evidenceId = `evidence:auto-${s.id.replace('suggestion:', '')}`;
          const edgeType = s.targetType === 'criterion' ? 'verifies' as const : 'implements' as const;

          p.addNode(evidenceId)
            .setProperty(evidenceId, 'kind', 'test')
            .setProperty(evidenceId, 'result', 'linked')
            .setProperty(evidenceId, 'produced_at', now)
            .setProperty(evidenceId, 'produced_by', ctx.agentId)
            .setProperty(evidenceId, 'type', 'evidence')
            .setProperty(evidenceId, 'source_file', s.testFile)
            .setProperty(evidenceId, 'auto_confidence', s.confidence);

          p.addEdge(evidenceId, s.targetId, edgeType);

          p.setProperty(s.id, 'status', 'ACCEPTED')
            .setProperty(s.id, 'resolved_by', ctx.agentId)
            .setProperty(s.id, 'resolved_at', now);

          acceptInfos.push({ suggestionId: s.id, evidenceId, edgeType, targetId: s.targetId, confidence: s.confidence });
        }
      });

      if (!ctx.json) {
        for (const info of acceptInfos) {
          ctx.muted(`  ${info.suggestionId} → ${info.evidenceId} ${info.edgeType} ${info.targetId} (${info.confidence})`);
        }
      }

      const accepted = acceptInfos.length;

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
