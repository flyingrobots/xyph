/**
 * FileNameLayer — Heuristic layer 1: file name matching.
 *
 * Compares the test file's base name against known module names that map
 * to graph targets. "Story.test.ts" testing a file that maps to a target
 * scores 0.8 (exact), partial token overlap scores 0.4.
 *
 * Part of M11 Phase 4 — ALK-006.
 */

import type { TestDescriptor, GraphTarget, LayerScore } from '../types.js';

export function scoreFileName(
  test: TestDescriptor,
  target: GraphTarget,
  moduleToTarget: Map<string, string>,
): LayerScore | null {
  // Extract base name without .test.ts / .spec.ts suffix
  const baseName = test.fileName
    .replace(/\.(test|spec)\.(ts|tsx|js|jsx)$/, '')
    .toLowerCase();

  if (baseName.length === 0) return null;

  // Check if any module name that maps to this target matches the test file name
  for (const [moduleName, targetId] of moduleToTarget) {
    if (targetId !== target.id) continue;

    const moduleBase = moduleName
      .replace(/\.(ts|tsx|js|jsx)$/, '')
      .toLowerCase();

    if (baseName === moduleBase) {
      return {
        layer: 'fileName',
        score: 0.8,
        evidence: `${test.fileName} matches module ${moduleName}`,
      };
    }

    // Partial match: one contains the other
    if (baseName.includes(moduleBase) || moduleBase.includes(baseName)) {
      return {
        layer: 'fileName',
        score: 0.4,
        evidence: `${test.fileName} partially matches module ${moduleName}`,
      };
    }
  }

  // Direct target ID token matching as fallback
  const targetTokens = target.id
    .replace(/^(criterion|req):/, '')
    .toLowerCase()
    .split(/[-_.]/)
    .filter((t) => t.length > 1);

  const fileTokens = baseName.split(/[-_.]/).filter((t) => t.length > 1);

  const overlap = fileTokens.filter((t) => targetTokens.includes(t)).length;
  if (overlap > 0 && targetTokens.length > 0) {
    const ratio = overlap / targetTokens.length;
    if (ratio >= 0.5) {
      return {
        layer: 'fileName',
        score: 0.4,
        evidence: `${overlap}/${targetTokens.length} tokens match between ${test.fileName} and ${target.id}`,
      };
    }
  }

  return null;
}
