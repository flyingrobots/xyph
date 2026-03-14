export type DiagnosticSeverity = 'error' | 'warning' | 'notice' | 'suggestion';

export type DiagnosticCategory =
  | 'structural'
  | 'readiness'
  | 'governance'
  | 'traceability'
  | 'workflow';

export type DiagnosticSource =
  | 'doctor'
  | 'readiness'
  | 'completion'
  | 'settlement'
  | 'briefing';

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  category: DiagnosticCategory;
  source: DiagnosticSource;
  summary: string;
  message: string;
  subjectId?: string;
  relatedIds: string[];
  blocking: boolean;
}
