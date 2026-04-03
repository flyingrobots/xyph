import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import type { DiagnosticLogEntry, DiagnosticLogSink } from '../../ports/DiagnosticLogPort.js';

export type DiagnosticLogChannel = 'actuator' | 'dashboard';

export function resolveDiagnosticLogDirectory(homeDir = homedir()): string {
  return join(homeDir, '.xyph', 'logs');
}

export function resolveDiagnosticLogPath(
  channel: DiagnosticLogChannel,
  homeDir = homedir(),
): string {
  return join(resolveDiagnosticLogDirectory(homeDir), `${channel}.log`);
}

export class FileDiagnosticLogSink implements DiagnosticLogSink {
  constructor(private readonly logPath: string) {}

  write(entry: DiagnosticLogEntry): void {
    mkdirSync(dirname(this.logPath), { recursive: true });
    appendFileSync(this.logPath, `${JSON.stringify({
      timestamp: new Date(entry.timestamp).toISOString(),
      level: entry.level,
      message: entry.message,
      ...(entry.context === undefined ? {} : { context: entry.context }),
    })}\n`, 'utf8');
  }
}
