import type { Diagnostic } from '../domain/models/diagnostics.js';

export function renderDiagnosticsLines(
  diagnostics: Diagnostic[],
  label = 'Diagnostics',
): string[] {
  if (diagnostics.length === 0) return [];

  const lines = ['', label];
  for (const diagnostic of diagnostics) {
    const target = diagnostic.subjectId ? ` ${diagnostic.subjectId}` : '';
    const related = diagnostic.relatedIds.length > 0
      ? ` [${diagnostic.relatedIds.join(', ')}]`
      : '';
    lines.push(
      `  - [${diagnostic.severity.toUpperCase()}] ${diagnostic.code}${target}${related}`,
    );
    lines.push(`      ${diagnostic.message}`);
  }
  return lines;
}
