/**
 * ImportDescribeLayer — Heuristic layer 2: import and describe block analysis.
 *
 * Checks if the test file imports modules linked to the target (0.7) and
 * whether describe block text has token overlap with the target (0.3–0.6).
 *
 * Part of M11 Phase 4 — ALK-006.
 */

import type { TestDescriptor, GraphTarget, LayerScore, DescribeBlock } from '../types.js';

export function scoreImportDescribe(
  test: TestDescriptor,
  target: GraphTarget,
  moduleToTarget: Map<string, string>,
): LayerScore | null {
  let bestScore = 0;
  let bestEvidence = '';

  // Check imports
  for (const imp of test.imports) {
    // Check if any module that maps to this target is imported
    for (const [moduleName, targetId] of moduleToTarget) {
      if (targetId !== target.id) continue;

      // Module specifier ends with the module name (possibly with extension stripped)
      const moduleBase = moduleName.replace(/\.(ts|tsx|js|jsx)$/, '');
      if (imp.moduleSpecifier.endsWith(moduleBase) || imp.moduleSpecifier.endsWith(moduleName)) {
        if (0.7 > bestScore) {
          bestScore = 0.7;
          bestEvidence = `imports ${imp.moduleSpecifier} which maps to ${target.id}`;
        }
      }
    }

    // Check if named imports overlap with target description tokens
    const targetTokens = extractSignificantTokens(target.description);
    for (const named of imp.namedImports) {
      const namedLower = named.toLowerCase();
      if (targetTokens.has(namedLower)) {
        if (0.5 > bestScore) {
          bestScore = 0.5;
          bestEvidence = `imports '${named}' which appears in target description`;
        }
      }
    }
  }

  // Check describe block text
  const describeTokens = collectDescribeTokens(test.describeBlocks);
  const targetTokens = extractSignificantTokens(target.description);

  if (describeTokens.size > 0 && targetTokens.size > 0) {
    let overlap = 0;
    for (const token of describeTokens) {
      if (targetTokens.has(token)) overlap++;
    }

    if (overlap > 0) {
      const ratio = overlap / Math.max(describeTokens.size, targetTokens.size);
      const describeScore = 0.3 + ratio * 0.3; // 0.3 to 0.6

      if (describeScore > bestScore) {
        bestScore = Math.round(describeScore * 1000) / 1000;
        bestEvidence = `${overlap} token(s) overlap between describe blocks and target description`;
      }
    }
  }

  if (bestScore === 0) return null;

  return {
    layer: 'importDescribe',
    score: bestScore,
    evidence: bestEvidence,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectDescribeTokens(blocks: DescribeBlock[]): Set<string> {
  const tokens = new Set<string>();
  for (const block of blocks) {
    for (const token of extractSignificantTokens(block.description)) {
      tokens.add(token);
    }
    for (const token of collectDescribeTokens(block.children)) {
      tokens.add(token);
    }
  }
  return tokens;
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'it', 'to', 'in', 'of', 'and', 'or', 'for',
  'be', 'has', 'have', 'had', 'was', 'were', 'are', 'been', 'do', 'does',
  'did', 'will', 'would', 'could', 'should', 'shall', 'may', 'might',
  'can', 'with', 'from', 'by', 'at', 'on', 'as', 'not', 'no', 'but',
  'if', 'then', 'else', 'when', 'that', 'this', 'these', 'those', 'all',
  'each', 'every', 'some', 'any', 'must', 'test',
]);

export function extractSignificantTokens(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .split(/[\s\-_.,:;!?()[\]{}'"\/\\]+/)
      .filter((t) => t.length > 2 && !STOP_WORDS.has(t)),
  );
}
