/**
 * LlmLayer — Heuristic layer 5: LLM-based analysis.
 *
 * Sends test content and candidate targets to a configured LLM for
 * intelligent matching. Falls back gracefully when provider is 'none'
 * or no API key is available.
 *
 * Unlike layers 1–4, this layer is async and operates on batches
 * per test file (to minimize API calls).
 *
 * Part of M11 Phase 4 — ALK-008.
 */

import type { TestDescriptor, GraphTarget, LayerScore } from '../types.js';
import type { LlmPort, LlmCandidate } from '../../../../ports/LlmPort.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface LlmLayerResult {
  targetId: string;
  score: LayerScore;
}

/**
 * Run LLM analysis for a single test file against all targets.
 * Returns scores only for targets the LLM matched with confidence > 0.
 */
export async function scoreLlmBatch(
  test: TestDescriptor,
  targets: GraphTarget[],
  llmPort: LlmPort,
): Promise<LlmLayerResult[]> {
  if (targets.length === 0) return [];

  const candidates: LlmCandidate[] = targets.map((t) => ({
    id: t.id,
    type: t.type,
    description: t.description,
  }));

  const matches = await llmPort.analyzeTestCoverage({
    testContent: test.content,
    testFilePath: test.filePath,
    candidates,
  });

  const results: LlmLayerResult[] = [];

  for (const match of matches) {
    if (match.confidence <= 0) continue;
    results.push({
      targetId: match.candidateId,
      score: {
        layer: 'llm',
        score: match.confidence,
        evidence: match.rationale,
      },
    });
  }

  return results;
}
