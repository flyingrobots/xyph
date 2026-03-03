/**
 * AnthropicLlmAdapter — Sends test analysis requests to Claude via the Anthropic API.
 *
 * Gracefully falls back when no API key is available or when the provider
 * is configured as 'none'.
 *
 * Part of M11 Phase 4 — ALK-007.
 */

import type { LlmPort, LlmMatchRequest, LlmMatch } from '../../ports/LlmPort.js';
import type { SecretAdapter } from './VaultSecretAdapter.js';
import type { LlmConfig } from '../../ports/ConfigPort.js';

export class AnthropicLlmAdapter implements LlmPort {
  constructor(
    private readonly secretAdapter: SecretAdapter,
    private readonly config: LlmConfig,
  ) {}

  async analyzeTestCoverage(request: LlmMatchRequest): Promise<LlmMatch[]> {
    if (this.config.provider === 'none') return [];

    const apiKey = await this.secretAdapter.getSecret('anthropic-api-key');
    if (!apiKey) return [];

    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey });

      const candidateList = request.candidates
        .map((c) => `- ${c.id} (${c.type}): ${c.description}`)
        .join('\n');

      const prompt = [
        'Analyze the following test file and determine which of the candidate requirements/criteria it verifies.',
        'Return a JSON array of matches with structure: [{ "candidateId": string, "confidence": number (0-1), "rationale": string }]',
        'Only include candidates with confidence > 0.3. Be conservative — only score high when the test clearly exercises the requirement.',
        '',
        `Test file: ${request.testFilePath}`,
        '```',
        request.testContent.slice(0, 4000), // Limit content to stay within token budget
        '```',
        '',
        'Candidates:',
        candidateList,
        '',
        'Return ONLY the JSON array, no markdown fencing or explanation.',
      ].join('\n');

      const response = await client.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        messages: [{ role: 'user', content: prompt }],
      });

      let text = '';
      for (const block of response.content) {
        if (block.type === 'text') {
          text += block.text;
        }
      }

      return this.parseResponse(text, request.candidates);
    } catch {
      // API failure — graceful degradation
      return [];
    }
  }

  private parseResponse(
    text: string,
    candidates: LlmMatchRequest['candidates'],
  ): LlmMatch[] {
    try {
      // Strip markdown fences if present
      const cleaned = text.replace(/^```(?:json)?\s*\n?/gm, '').replace(/\n?```\s*$/gm, '').trim();
      const parsed: unknown = JSON.parse(cleaned);

      if (!Array.isArray(parsed)) return [];

      const validIds = new Set(candidates.map((c) => c.id));
      const matches: LlmMatch[] = [];

      for (const item of parsed) {
        if (typeof item !== 'object' || item === null) continue;
        const record = item as Record<string, unknown>;
        const candidateId = record['candidateId'];
        const confidence = record['confidence'];
        const rationale = record['rationale'];

        if (typeof candidateId !== 'string' || !validIds.has(candidateId)) continue;
        if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) continue;
        if (typeof rationale !== 'string') continue;

        matches.push({ candidateId, confidence, rationale });
      }

      return matches;
    } catch {
      return [];
    }
  }
}

/**
 * No-op LLM adapter for testing or when LLM is disabled.
 */
export class NoOpLlmAdapter implements LlmPort {
  async analyzeTestCoverage(_request: LlmMatchRequest): Promise<LlmMatch[]> {
    return [];
  }
}
