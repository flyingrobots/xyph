export type DiagnosticLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface DiagnosticLogEntry {
  level: DiagnosticLogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: number;
}

export interface DiagnosticLogSink {
  write(entry: DiagnosticLogEntry): void;
}

export interface DiagnosticLogPort {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  child(context: Record<string, unknown>): DiagnosticLogPort;
}
