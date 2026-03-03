/**
 * TraceabilityScan — Test annotation parser for traceability evidence.
 *
 * Scans source files for `// @xyph criterion:<id>` annotations and returns
 * structured annotation records that can be used to write evidence nodes.
 *
 * Part of M11 Traceability — TRC-007.
 */

export interface Annotation {
  criterionId: string;
  filePath: string;
  lineNumber: number;
}

/**
 * Pattern: `// @xyph criterion:<id>` or `// @xyph criterion:<id1> criterion:<id2>`
 * Matches one or more `criterion:<id>` references per comment line.
 */
const ANNOTATION_PATTERN = /\/\/\s*@xyph\s+(.*)/;
const CRITERION_REF = /criterion:[\w.-]+/g;

/**
 * Parse `@xyph criterion:ID` annotations from file contents.
 *
 * Supports:
 * - Single: `// @xyph criterion:TRACE-001-AC1`
 * - Multi:  `// @xyph criterion:TRACE-001-AC1 criterion:TRACE-001-AC2`
 * - Ignores malformed lines (no criterion: reference after @xyph)
 */
export function scanAnnotations(content: string, filePath: string): Annotation[] {
  const annotations: Annotation[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;

    const match = ANNOTATION_PATTERN.exec(line);
    if (!match) continue;

    const tail = match[1];
    if (!tail) continue;

    const refs = tail.match(CRITERION_REF);
    if (!refs) continue;

    for (const ref of refs) {
      annotations.push({
        criterionId: ref,
        filePath,
        lineNumber: i + 1, // 1-based
      });
    }
  }

  return annotations;
}
