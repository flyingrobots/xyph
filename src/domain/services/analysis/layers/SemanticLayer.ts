/**
 * SemanticLayer — Heuristic layer 4: token-based fuzzy matching.
 *
 * Computes Jaccard similarity between significant tokens in test descriptions
 * and target descriptions. Stop words are removed to focus on meaningful terms.
 *
 * Part of M11 Phase 4 — ALK-006.
 */

import type { TestDescriptor, GraphTarget, LayerScore, DescribeBlock } from '../types.js';
import { extractSignificantTokens } from './ImportDescribeLayer.js';

export function scoreSemantic(
  test: TestDescriptor,
  target: GraphTarget,
): LayerScore | null {
  const testTokens = collectTestTokens(test);
  const targetTokens = extractSignificantTokens(target.description);

  if (testTokens.size === 0 || targetTokens.size === 0) return null;

  const intersection = new Set<string>();
  for (const token of testTokens) {
    if (targetTokens.has(token)) {
      intersection.add(token);
    }
  }

  if (intersection.size === 0) return null;

  // Jaccard similarity = |A ∩ B| / |A ∪ B|
  const unionSize = testTokens.size + targetTokens.size - intersection.size;
  const jaccard = intersection.size / unionSize;

  if (jaccard < 0.05) return null; // Too low to be meaningful

  // Scale to [0, 1] — raw Jaccard is typically low for text
  // Use a tuned scaling: score = min(jaccard * 3, 1.0)
  const score = Math.min(jaccard * 3, 1.0);
  const rounded = Math.round(score * 1000) / 1000;

  return {
    layer: 'semantic',
    score: rounded,
    evidence: `${intersection.size} shared token(s): ${[...intersection].slice(0, 5).join(', ')}${intersection.size > 5 ? '...' : ''} (Jaccard: ${(jaccard * 100).toFixed(1)}%)`,
  };
}

// ---------------------------------------------------------------------------
// Token collection from test structure
// ---------------------------------------------------------------------------

function collectTestTokens(test: TestDescriptor): Set<string> {
  const tokens = new Set<string>();

  // Describe block descriptions
  for (const block of test.describeBlocks) {
    addBlockTokens(block, tokens);
  }

  // Top-level it blocks
  for (const itBlock of test.itBlocks) {
    for (const token of extractSignificantTokens(itBlock.description)) {
      tokens.add(token);
    }
  }

  // Import names (class/function names are meaningful)
  for (const imp of test.imports) {
    for (const name of imp.namedImports) {
      // Split PascalCase: StoryProps → story, props
      const parts = name.replace(/([a-z])([A-Z])/g, '$1 $2').split(' ');
      for (const part of parts) {
        if (part.length > 2) {
          tokens.add(part.toLowerCase());
        }
      }
    }
  }

  return tokens;
}

function addBlockTokens(block: DescribeBlock, tokens: Set<string>): void {
  for (const token of extractSignificantTokens(block.description)) {
    tokens.add(token);
  }
  for (const itBlock of block.itBlocks) {
    for (const token of extractSignificantTokens(itBlock.description)) {
      tokens.add(token);
    }
  }
  for (const child of block.children) {
    addBlockTokens(child, tokens);
  }
}
