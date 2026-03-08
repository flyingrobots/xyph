/**
 * Shared types for the auto-linking analysis pipeline.
 *
 * Part of M11 Phase 4 — ALK-004.
 */

// ---------------------------------------------------------------------------
// Test file descriptor (output of TestFileParser)
// ---------------------------------------------------------------------------

export interface ItBlock {
  description: string;
  lineNumber: number;
  calledFunctions: string[];
  calledMethods: string[];
}

export interface DescribeBlock {
  description: string;
  lineNumber: number;
  children: DescribeBlock[];
  itBlocks: ItBlock[];
}

export interface TestDescriptor {
  filePath: string;
  fileName: string;
  imports: ImportRef[];
  describeBlocks: DescribeBlock[];
  itBlocks: ItBlock[];
  content: string;
}

export interface ImportRef {
  moduleSpecifier: string;
  namedImports: string[];
  defaultImport?: string;
  namespaceImport?: string;
}

// ---------------------------------------------------------------------------
// Graph target (what we're trying to match tests to)
// ---------------------------------------------------------------------------

export interface GraphTarget {
  id: string;
  type: 'criterion' | 'requirement';
  description: string;
  parentId?: string;
}

// ---------------------------------------------------------------------------
// Layer scoring
// ---------------------------------------------------------------------------

export interface LayerScore {
  layer: string;
  score: number;
  evidence: string;
}

export interface AnalysisMatch {
  testFile: string;
  targetId: string;
  targetType: 'criterion' | 'requirement';
  confidence: number;
  layers: LayerScore[];
}
