/**
 * TestParserPort — Abstracts test-file parsing from its implementation.
 *
 * The analysis pipeline needs TestDescriptors but should not depend on
 * the TypeScript Compiler API or filesystem access. This port decouples
 * parsing infrastructure from the domain.
 *
 * Part of Hexagonal Architecture Audit — H2 fix.
 */

import type { TestDescriptor } from '../domain/services/analysis/types.js';

export interface TestParserPort {
  /** Parse a test file's content and return a structured descriptor. */
  parseTestFile(content: string, filePath: string): TestDescriptor;
}
