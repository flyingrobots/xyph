/**
 * LlmPort — Provider-agnostic interface for LLM-based test analysis.
 *
 * Part of M11 Phase 4 — ALK-007.
 */

export interface LlmMatchRequest {
  testContent: string;
  testFilePath: string;
  candidates: LlmCandidate[];
}

export interface LlmCandidate {
  id: string;
  type: 'criterion' | 'requirement';
  description: string;
}

export interface LlmMatch {
  candidateId: string;
  confidence: number;
  rationale: string;
}

export interface LlmPort {
  /** Analyze test content against candidates and return match scores. */
  analyzeTestCoverage(request: LlmMatchRequest): Promise<LlmMatch[]>;
}
