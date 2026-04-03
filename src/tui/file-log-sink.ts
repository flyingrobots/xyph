import type { DiagnosticLogEntry } from '../ports/DiagnosticLogPort.js';
import { FileDiagnosticLogSink, resolveDiagnosticLogPath } from '../infrastructure/logging/FileDiagnosticLogSink.js';
import { homedir } from 'node:os';

export function resolveDashboardLogPath(homeDir = homedir()): string {
  return resolveDiagnosticLogPath('dashboard', homeDir);
}

export function appendDashboardLogEntry(logPath: string, entry: DiagnosticLogEntry): void {
  new FileDiagnosticLogSink(logPath).write(entry);
}
