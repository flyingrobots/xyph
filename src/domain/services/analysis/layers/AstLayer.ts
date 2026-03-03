/**
 * AstLayer — Heuristic layer 3: AST analysis of test bodies.
 *
 * Checks whether the test calls functions or methods that are documented
 * in the target's description. Function calls on target classes score 0.7,
 * exact function name matches score 0.9.
 *
 * Part of M11 Phase 4 — ALK-006.
 */

import type { TestDescriptor, GraphTarget, LayerScore, ItBlock, DescribeBlock } from '../types.js';

export function scoreAst(
  test: TestDescriptor,
  target: GraphTarget,
  functionToTarget: Map<string, string>,
): LayerScore | null {
  const allItBlocks = collectAllItBlocks(test);
  let bestScore = 0;
  let bestEvidence = '';

  for (const itBlock of allItBlocks) {
    // Check function calls against known mappings
    for (const fn of itBlock.calledFunctions) {
      const targetId = functionToTarget.get(fn);
      if (targetId === target.id) {
        if (0.9 > bestScore) {
          bestScore = 0.9;
          bestEvidence = `calls ${fn}() which maps to ${target.id}`;
        }
      }
    }

    // Check method calls against target description tokens
    const descTokens = extractIdentifiers(target.description);
    for (const method of itBlock.calledMethods) {
      const methodLower = method.toLowerCase();
      if (descTokens.has(methodLower)) {
        if (0.7 > bestScore) {
          bestScore = 0.7;
          bestEvidence = `calls .${method}() which appears in target description`;
        }
      }
    }

    // Check function calls against description tokens too
    for (const fn of itBlock.calledFunctions) {
      const fnLower = fn.toLowerCase();
      if (descTokens.has(fnLower)) {
        if (0.7 > bestScore) {
          bestScore = 0.7;
          bestEvidence = `calls ${fn}() which appears in target description`;
        }
      }
    }
  }

  if (bestScore === 0) return null;

  return {
    layer: 'ast',
    score: bestScore,
    evidence: bestEvidence,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectAllItBlocks(test: TestDescriptor): ItBlock[] {
  const result: ItBlock[] = [...test.itBlocks];
  collectFromDescribe(test.describeBlocks, result);
  return result;
}

function collectFromDescribe(blocks: DescribeBlock[], result: ItBlock[]): void {
  for (const block of blocks) {
    result.push(...block.itBlocks);
    collectFromDescribe(block.children, result);
  }
}

function extractIdentifiers(text: string): Set<string> {
  // Extract camelCase/PascalCase words and split them, plus standalone words
  const words = new Set<string>();
  const tokens = text.split(/[\s\-_.,:;!?()[\]{}'"\/\\]+/);

  for (const token of tokens) {
    if (token.length < 2) continue;
    words.add(token.toLowerCase());

    // Split camelCase: computeFrontier → [compute, frontier]
    const camelParts = token.replace(/([a-z])([A-Z])/g, '$1 $2').split(' ');
    for (const part of camelParts) {
      if (part.length > 2) {
        words.add(part.toLowerCase());
      }
    }
  }

  return words;
}
