/**
 * TestFileParser — Extracts test structure from TypeScript files using the TS Compiler API.
 *
 * Parses describe/it blocks, imports, and function/method calls to build a
 * TestDescriptor that heuristic layers can score against graph targets.
 *
 * Part of M11 Phase 4 — ALK-004.
 */

import ts from 'typescript';
import path from 'node:path';
import type { TestDescriptor, DescribeBlock, ItBlock, ImportRef } from './types.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parseTestFile(content: string, filePath: string): TestDescriptor {
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true, // setParentNodes
    ts.ScriptKind.TSX,
  );

  const imports = extractImports(sourceFile);
  const describeBlocks: DescribeBlock[] = [];
  const itBlocks: ItBlock[] = [];

  visitNode(sourceFile, sourceFile, describeBlocks, itBlocks);

  return {
    filePath,
    fileName: path.basename(filePath),
    imports,
    describeBlocks,
    itBlocks,
    content,
  };
}

// ---------------------------------------------------------------------------
// Import extraction
// ---------------------------------------------------------------------------

function extractImports(sourceFile: ts.SourceFile): ImportRef[] {
  const refs: ImportRef[] = [];

  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;

    const moduleSpecifier = stmt.moduleSpecifier;
    if (!ts.isStringLiteral(moduleSpecifier)) continue;

    const namedImports: string[] = [];
    let defaultImport: string | undefined;

    if (stmt.importClause) {
      if (stmt.importClause.name) {
        defaultImport = stmt.importClause.name.text;
      }

      const bindings = stmt.importClause.namedBindings;
      if (bindings) {
        if (ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) {
            namedImports.push(element.name.text);
          }
        } else if (ts.isNamespaceImport(bindings)) {
          defaultImport = bindings.name.text;
        }
      }
    }

    refs.push({
      moduleSpecifier: moduleSpecifier.text,
      namedImports,
      defaultImport,
    });
  }

  return refs;
}

// ---------------------------------------------------------------------------
// Describe / it block extraction
// ---------------------------------------------------------------------------

const DESCRIBE_NAMES = new Set(['describe', 'suite']);
const IT_NAMES = new Set(['it', 'test', 'specify']);

/**
 * Resolve the root identifier of a call expression.
 * Handles modifiers: it.only → it, describe.skip → describe,
 * and chained calls: it.each(...)() → it.
 */
function getCallName(expr: ts.Expression): string | undefined {
  // Direct identifier: describe(...), it(...)
  if (ts.isIdentifier(expr)) return expr.text;
  // Property access: it.only(...), describe.skip(...)
  // Walk to the leftmost identifier
  if (ts.isPropertyAccessExpression(expr)) {
    let current: ts.Expression = expr;
    while (ts.isPropertyAccessExpression(current)) {
      current = current.expression;
    }
    // Handle chained calls like it.each(...)() where expression is a CallExpression
    if (ts.isCallExpression(current)) {
      return getCallName(current.expression);
    }
    if (ts.isIdentifier(current)) return current.text;
  }
  // Chained call: it.each(...)() — outer expression is a CallExpression
  if (ts.isCallExpression(expr)) {
    return getCallName(expr.expression);
  }
  return undefined;
}

function getStringArgument(node: ts.CallExpression): string | undefined {
  const firstArg = node.arguments[0];
  if (!firstArg) return undefined;
  if (ts.isStringLiteral(firstArg)) return firstArg.text;
  if (ts.isNoSubstitutionTemplateLiteral(firstArg)) return firstArg.text;
  if (ts.isTemplateExpression(firstArg)) return firstArg.head.text + '...';
  return undefined;
}

function visitNode(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  describeBlocks: DescribeBlock[],
  itBlocks: ItBlock[],
): void {
  if (ts.isCallExpression(node)) {
    const name = getCallName(node.expression);

    if (name && DESCRIBE_NAMES.has(name)) {
      const description = getStringArgument(node) ?? '(anonymous)';
      const lineNumber = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      const block: DescribeBlock = {
        description,
        lineNumber,
        children: [],
        itBlocks: [],
      };

      // Visit children of describe callback
      const callback = node.arguments[1];
      if (callback) {
        visitNode(callback, sourceFile, block.children, block.itBlocks);
      }

      describeBlocks.push(block);
      return; // Don't recurse again — we already visited the callback
    }

    if (name && IT_NAMES.has(name)) {
      const description = getStringArgument(node) ?? '(anonymous)';
      const lineNumber = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      const calledFunctions: string[] = [];
      const calledMethods: string[] = [];

      // Walk the test body for function/method calls
      const callback = node.arguments[1];
      if (callback) {
        collectCalls(callback, calledFunctions, calledMethods);
      }

      itBlocks.push({ description, lineNumber, calledFunctions, calledMethods });
      return;
    }
  }

  ts.forEachChild(node, (child) => visitNode(child, sourceFile, describeBlocks, itBlocks));
}

// ---------------------------------------------------------------------------
// Call expression collection (for AST layer)
// ---------------------------------------------------------------------------

function collectCalls(
  node: ts.Node,
  calledFunctions: string[],
  calledMethods: string[],
): void {
  if (ts.isCallExpression(node)) {
    const expr = node.expression;
    if (ts.isIdentifier(expr)) {
      const name = expr.text;
      // Skip common test framework functions
      if (!isTestFrameworkCall(name)) {
        calledFunctions.push(name);
      }
    } else if (ts.isPropertyAccessExpression(expr)) {
      calledMethods.push(expr.name.text);
    }
  }

  ts.forEachChild(node, (child) => collectCalls(child, calledFunctions, calledMethods));
}

const TEST_FRAMEWORK_CALLS = new Set([
  'expect', 'describe', 'it', 'test', 'beforeEach', 'afterEach',
  'beforeAll', 'afterAll', 'jest', 'vi', 'vitest', 'assert',
  'suite', 'specify', 'require',
]);

function isTestFrameworkCall(name: string): boolean {
  return TEST_FRAMEWORK_CALLS.has(name);
}
