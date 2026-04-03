/**
 * Analyze CLI command — orchestrates heuristic test auto-linking.
 *
 * Resolves config → fetches snapshot → globs test files → parses → builds
 * lookup maps → runs analysis orchestrator → filters existing edges and
 * rejected suggestions → auto-links above threshold → writes suggestions
 * below threshold → reports.
 *
 * Part of M11 Phase 4 — ALK-009.
 */

import { createHash } from 'node:crypto';
import type { Command } from 'commander';
import type { CliContext } from '../context.js';
import { createErrorHandler } from '../errorHandler.js';
import { liveObservation } from '../../ports/ObservationPort.js';

/** Deterministic short hash of testFile+targetId to avoid slug truncation collisions. */
function linkHash(testFile: string, targetId: string): string {
  return createHash('sha256').update(`${testFile}\0${targetId}`).digest('hex').slice(0, 12);
}

const VALID_LAYERS = ['fileName', 'importDescribe', 'ast', 'semantic', 'llm'] as const;
type LayerName = typeof VALID_LAYERS[number];

export function registerAnalyzeCommands(program: Command, ctx: CliContext): void {
  const withErrorHandler = createErrorHandler(ctx);

  program
    .command('analyze')
    .description('Auto-detect test→requirement/criterion links using heuristic analysis')
    .option('--glob <pattern>', 'Glob pattern for test files (overrides config)')
    .option('--dry-run', 'Preview matches without writing to the graph')
    .option('--layers <names>', 'Comma-separated layer names to run (default: all)')
    .option('--min-confidence <n>', 'Override minAutoConfidence threshold')
    .action(withErrorHandler(async (opts: {
      glob?: string; dryRun?: boolean; layers?: string; minConfidence?: string;
    }) => {
      // --- Resolve config ---
      const { ConfigAdapter } = await import('../../infrastructure/adapters/ConfigAdapter.js');
      const configAdapter = new ConfigAdapter(ctx.graphPort, process.cwd());
      const config = await configAdapter.getAll();

      if (opts.glob) config.testGlob = opts.glob;
      if (opts.minConfidence) {
        const mc = Number(opts.minConfidence);
        if (!Number.isFinite(mc) || mc < 0 || mc > 1) {
          throw new Error(`--min-confidence must be between 0 and 1, got: '${opts.minConfidence}'`);
        }
        config.minAutoConfidence = mc;
      }

      // Parse layer filter
      let enabledLayers: Set<LayerName>;
      if (opts.layers) {
        const names = opts.layers.split(',').map((s) => s.trim());
        for (const name of names) {
          if (!(VALID_LAYERS as readonly string[]).includes(name)) {
            throw new Error(`Unknown layer: '${name}'. Valid: ${VALID_LAYERS.join(', ')}`);
          }
        }
        enabledLayers = new Set(names as LayerName[]);
      } else {
        enabledLayers = new Set(VALID_LAYERS);
      }

      // --- Fetch snapshot ---
      const readSession = await ctx.observation.openSession(
        liveObservation('analyze.snapshot'),
      );
      const snapshot = await readSession.fetchSnapshot('analysis');

      // --- Glob test files ---
      const { globSync } = await import('node:fs');
      const files = globSync(config.testGlob, { cwd: process.cwd() });

      if (files.length === 0) {
        if (ctx.json) {
          ctx.jsonOut({ success: true, command: 'analyze', data: { filesScanned: 0, matches: 0 } });
          return;
        }
        ctx.warn('[WARN] No test files matched the glob pattern.');
        return;
      }

      // --- Parse test files ---
      const { parseTestFile } = await import('../../infrastructure/adapters/TsCompilerTestParserAdapter.js');
      const fs = await import('node:fs/promises');

      const tests = await Promise.all(
        files.map(async (filePath) => {
          const content = await fs.readFile(filePath, 'utf-8');
          return parseTestFile(content, filePath);
        }),
      );

      // --- Build graph targets ---
      const targets = [
        ...snapshot.criteria.map((c) => ({
          id: c.id,
          type: 'criterion' as const,
          description: c.description,
          parentId: c.requirementId,
        })),
        ...snapshot.requirements.map((r) => ({
          id: r.id,
          type: 'requirement' as const,
          description: r.description,
          parentId: r.storyId,
        })),
      ];

      if (targets.length === 0) {
        if (ctx.json) {
          ctx.jsonOut({
            success: true, command: 'analyze',
            data: { filesScanned: files.length, targets: 0, matches: 0 },
          });
          return;
        }
        ctx.muted(`Scanned ${files.length} files — no criteria or requirements in graph.`);
        return;
      }

      // --- Build lookup maps for layers ---
      // moduleToTarget: module base name → target ID (from imports in the codebase)
      // functionToTarget: function name → target ID (from target descriptions)
      const moduleToTarget = new Map<string, string>();
      const functionToTarget = new Map<string, string>();

      for (const target of targets) {
        // Extract identifiers from description for function mapping
        const words = target.description
          .split(/[\s\-_.,:;!?()[\]{}'"/\\]+/)
          .filter((w) => /^[a-zA-Z]\w{2,}$/.test(w));

        for (const word of words) {
          // Only map camelCase/PascalCase identifiers (likely function names)
          if (/[a-z][A-Z]/.test(word) || /^[A-Z][a-z]/.test(word)) {
            functionToTarget.set(word, target.id);
          }
        }
      }

      // --- Build heuristic layers ---
      const { scoreFileName } = await import('../../domain/services/analysis/layers/FileNameLayer.js');
      const { scoreImportDescribe } = await import('../../domain/services/analysis/layers/ImportDescribeLayer.js');
      const { scoreAst } = await import('../../domain/services/analysis/layers/AstLayer.js');
      const { scoreSemantic } = await import('../../domain/services/analysis/layers/SemanticLayer.js');

      type HeuristicLayer = import('../../domain/services/analysis/AnalysisOrchestrator.js').HeuristicLayer;
      const layers: HeuristicLayer[] = [];

      if (enabledLayers.has('fileName')) {
        layers.push({
          name: 'fileName',
          score: (test, target) => scoreFileName(test, target, moduleToTarget),
        });
      }
      if (enabledLayers.has('importDescribe')) {
        layers.push({
          name: 'importDescribe',
          score: (test, target) => scoreImportDescribe(test, target, moduleToTarget),
        });
      }
      if (enabledLayers.has('ast')) {
        layers.push({
          name: 'ast',
          score: (test, target) => scoreAst(test, target, functionToTarget),
        });
      }
      if (enabledLayers.has('semantic')) {
        layers.push({
          name: 'semantic',
          score: (test, target) => scoreSemantic(test, target),
        });
      }

      // LLM layer is handled separately (async, batch)
      let llmScores = new Map<string, Map<string, import('../../domain/services/analysis/types.js').LayerScore>>();
      if (enabledLayers.has('llm') && config.llm.provider !== 'none') {
        try {
          const { scoreLlmBatch } = await import('../../domain/services/analysis/layers/LlmLayer.js');
          const { VaultSecretAdapter } = await import('../../infrastructure/adapters/VaultSecretAdapter.js');
          const { AnthropicLlmAdapter } = await import('../../infrastructure/adapters/AnthropicLlmAdapter.js');

          const secretAdapter = new VaultSecretAdapter();
          const llmAdapter = new AnthropicLlmAdapter(secretAdapter, config.llm);

          // Batch per test file
          for (const test of tests) {
            const results = await scoreLlmBatch(test, targets, llmAdapter);
            if (results.length > 0) {
              const testMap = new Map<string, import('../../domain/services/analysis/types.js').LayerScore>();
              for (const r of results) {
                testMap.set(r.targetId, r.score);
              }
              llmScores.set(test.filePath, testMap);
            }
          }
        } catch {
          // LLM unavailable — continue without it
          llmScores = new Map();
        }
      }

      // Inject LLM scores into the layer array for the orchestrator
      if (llmScores.size > 0) {
        layers.push({
          name: 'llm',
          score: (test, target) => {
            const testMap = llmScores.get(test.filePath);
            if (!testMap) return null;
            return testMap.get(target.id) ?? null;
          },
        });
      }

      // --- Run orchestrator ---
      const { analyzeTestTargetPairs } = await import('../../domain/services/analysis/AnalysisOrchestrator.js');
      const result = analyzeTestTargetPairs(tests, targets, layers, config);

      // --- Filter existing edges and rejected suggestions ---
      const existingEdges = new Set<string>();
      for (const ev of snapshot.evidence) {
        if (ev.sourceFile) {
          if (ev.criterionId) existingEdges.add(`${ev.sourceFile}:${ev.criterionId}`);
          if (ev.requirementId) existingEdges.add(`${ev.sourceFile}:${ev.requirementId}`);
        }
      }

      const rejectedIds = new Set<string>();
      for (const s of snapshot.suggestions) {
        if (s.status === 'REJECTED') {
          rejectedIds.add(`${s.testFile}:${s.targetId}`);
        }
      }

      const filteredAutoLinks = result.autoLinks.filter(
        (m) => !existingEdges.has(`${m.testFile}:${m.targetId}`) &&
               !rejectedIds.has(`${m.testFile}:${m.targetId}`),
      );
      const filteredSuggestions = result.suggestions.filter(
        (m) => !existingEdges.has(`${m.testFile}:${m.targetId}`) &&
               !rejectedIds.has(`${m.testFile}:${m.targetId}`),
      );

      // --- Dry run: just report ---
      if (opts.dryRun) {
        if (ctx.json) {
          ctx.jsonOut({
            success: true, command: 'analyze',
            data: {
              dryRun: true,
              filesScanned: files.length,
              targets: targets.length,
              autoLinks: filteredAutoLinks,
              suggestions: filteredSuggestions,
              discarded: result.discarded,
            },
          });
          return;
        }

        ctx.ok(`[DRY RUN] Scanned ${files.length} files against ${targets.length} targets`);
        ctx.muted(`  Auto-links (>= ${config.minAutoConfidence}): ${filteredAutoLinks.length}`);
        for (const m of filteredAutoLinks) {
          ctx.muted(`    ${m.testFile} → ${m.targetId} (${m.confidence})`);
        }
        ctx.muted(`  Suggestions (>= ${config.suggestionFloor}): ${filteredSuggestions.length}`);
        for (const m of filteredSuggestions) {
          ctx.muted(`    ${m.testFile} → ${m.targetId} (${m.confidence})`);
        }
        ctx.muted(`  Discarded: ${result.discarded}`);
        return;
      }

      // --- Write results to graph ---
      const graph = await ctx.graphPort.getGraph();
      const now = Date.now();

      // Auto-link: batch all linked-evidence nodes + edges into a single patch
      interface AutoLinkInfo { evidenceId: string; edgeType: 'verifies' | 'implements'; targetId: string; confidence: number }
      const autoLinkInfos: AutoLinkInfo[] = [];

      if (filteredAutoLinks.length > 0) {
        await graph.patch((p) => {
          for (const m of filteredAutoLinks) {
            const evidenceId = `evidence:auto-${linkHash(m.testFile, m.targetId)}`;
            const edgeType = m.targetType === 'criterion' ? 'verifies' as const : 'implements' as const;

            p.addNode(evidenceId)
              .setProperty(evidenceId, 'kind', 'test')
              .setProperty(evidenceId, 'result', 'linked')
              .setProperty(evidenceId, 'produced_at', now)
              .setProperty(evidenceId, 'produced_by', ctx.agentId)
              .setProperty(evidenceId, 'type', 'evidence')
              .setProperty(evidenceId, 'source_file', m.testFile)
              .setProperty(evidenceId, 'auto_confidence', m.confidence);

            p.addEdge(evidenceId, m.targetId, edgeType);
            autoLinkInfos.push({ evidenceId, edgeType, targetId: m.targetId, confidence: m.confidence });
          }
        });
      }

      if (!ctx.json) {
        for (const info of autoLinkInfos) {
          ctx.muted(`  [AUTO] ${info.evidenceId} ${info.edgeType} ${info.targetId} (${info.confidence})`);
        }
      }

      // Suggestions: batch all suggestion nodes + edges into a single patch
      interface SuggestionInfo { suggestionId: string; targetId: string; confidence: number }
      const suggestionInfos: SuggestionInfo[] = [];

      if (filteredSuggestions.length > 0) {
        await graph.patch((p) => {
          for (const m of filteredSuggestions) {
            const suggestionId = `suggestion:${linkHash(m.testFile, m.targetId)}`;

            p.addNode(suggestionId)
              .setProperty(suggestionId, 'type', 'suggestion')
              .setProperty(suggestionId, 'test_file', m.testFile)
              .setProperty(suggestionId, 'target_id', m.targetId)
              .setProperty(suggestionId, 'target_type', m.targetType)
              .setProperty(suggestionId, 'confidence', m.confidence)
              .setProperty(suggestionId, 'layers', JSON.stringify(m.layers))
              .setProperty(suggestionId, 'status', 'PENDING')
              .setProperty(suggestionId, 'suggested_by', ctx.agentId)
              .setProperty(suggestionId, 'suggested_at', now);

            p.addEdge(suggestionId, m.targetId, 'suggests');
            suggestionInfos.push({ suggestionId, targetId: m.targetId, confidence: m.confidence });
          }
        });
      }

      if (!ctx.json) {
        for (const info of suggestionInfos) {
          ctx.muted(`  [SUGGEST] ${info.suggestionId} → ${info.targetId} (${info.confidence})`);
        }
      }

      const evidenceWritten = autoLinkInfos.length;
      const suggestionsWritten = suggestionInfos.length;

      if (ctx.json) {
        ctx.jsonOut({
          success: true, command: 'analyze',
          data: {
            filesScanned: files.length,
            targets: targets.length,
            evidenceWritten,
            suggestionsWritten,
            discarded: result.discarded,
          },
        });
        return;
      }

      ctx.ok(`[OK] Analyzed ${files.length} files against ${targets.length} targets:`);
      ctx.muted(`  Linked evidence written: ${evidenceWritten}`);
      ctx.muted(`  Suggestions written: ${suggestionsWritten}`);
      ctx.muted(`  Discarded: ${result.discarded}`);
    }));
}
