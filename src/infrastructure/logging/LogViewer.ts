import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import type { DiagnosticLogChannel } from './FileDiagnosticLogSink.js';
import { resolveDiagnosticLogDirectory, resolveDiagnosticLogPath } from './FileDiagnosticLogSink.js';

export interface DiagnosticLogFileInfo {
  channel: DiagnosticLogChannel;
  path: string;
  exists: boolean;
}

export interface PersistedDiagnosticLogEntry {
  timestamp: string;
  level: string;
  message: string;
  context?: unknown;
}

export interface DiagnosticLogViewEntry extends PersistedDiagnosticLogEntry {
  channel: DiagnosticLogChannel;
  path: string;
}

export interface DiagnosticLogReadCursor {
  offset: number;
  remainder: string;
}

export interface DiagnosticLogIncrementalRead {
  exists: boolean;
  cursor: DiagnosticLogReadCursor;
  entries: DiagnosticLogViewEntry[];
}

const DIAGNOSTIC_LOG_CHANNELS: readonly DiagnosticLogChannel[] = ['actuator', 'dashboard'] as const;

export function listDiagnosticLogFiles(homeDir = homedir()): DiagnosticLogFileInfo[] {
  return DIAGNOSTIC_LOG_CHANNELS.map((channel) => {
    const path = resolveDiagnosticLogPath(channel, homeDir);
    return {
      channel,
      path,
      exists: existsSync(path),
    };
  });
}

export function tailLines(content: string, count: number): string[] {
  if (count <= 0) return [];
  const lines = content.split('\n').filter((line) => line.trim().length > 0);
  return lines.slice(-count);
}

export function parseDiagnosticLogLine(
  rawLine: string,
  channel: DiagnosticLogChannel,
  path: string,
): DiagnosticLogViewEntry {
  const parsed = JSON.parse(rawLine) as PersistedDiagnosticLogEntry;
  return {
    channel,
    path,
    timestamp: parsed.timestamp,
    level: parsed.level,
    message: parsed.message,
    ...(parsed.context === undefined ? {} : { context: parsed.context }),
  };
}

export function parseDiagnosticLogChunk(
  chunk: string,
  channel: DiagnosticLogChannel,
  path: string,
  remainder = '',
): { entries: DiagnosticLogViewEntry[]; remainder: string } {
  const text = remainder + chunk;
  const rawLines = text.split('\n');
  const nextRemainder = text.endsWith('\n') ? '' : (rawLines.pop() ?? '');
  const entries = rawLines
    .filter((line) => line.trim().length > 0)
    .map((line) => parseDiagnosticLogLine(line, channel, path));
  return { entries, remainder: nextRemainder };
}

export function readDiagnosticLogEntries(
  file: DiagnosticLogFileInfo,
  count = 20,
): DiagnosticLogViewEntry[] {
  if (!file.exists) return [];
  const content = readFileSync(file.path, 'utf8');
  return tailLines(content, count).map((line) => parseDiagnosticLogLine(line, file.channel, file.path));
}

export function initialDiagnosticLogCursor(file: DiagnosticLogFileInfo): DiagnosticLogReadCursor {
  if (!file.exists) {
    return { offset: 0, remainder: '' };
  }
  return {
    offset: statSync(file.path).size,
    remainder: '',
  };
}

export function readDiagnosticLogEntriesSince(
  file: DiagnosticLogFileInfo,
  cursor: DiagnosticLogReadCursor,
): DiagnosticLogIncrementalRead {
  if (!existsSync(file.path)) {
    return {
      exists: false,
      cursor,
      entries: [],
    };
  }

  const content = readFileSync(file.path);
  const startOffset = cursor.offset > content.length ? 0 : cursor.offset;
  const chunk = content.subarray(startOffset).toString('utf8');
  const parsed = parseDiagnosticLogChunk(chunk, file.channel, file.path, startOffset === 0 ? '' : cursor.remainder);

  return {
    exists: true,
    cursor: {
      offset: content.length,
      remainder: parsed.remainder,
    },
    entries: parsed.entries,
  };
}

export function formatDiagnosticLogEntry(entry: DiagnosticLogViewEntry): string {
  const base = `${entry.timestamp} [${entry.level}] ${entry.message}`;
  if (entry.context === undefined) return base;
  return `${base} ${JSON.stringify(entry.context)}`;
}

export function resolveDiagnosticLogSummary(homeDir = homedir()): {
  directory: string;
  files: DiagnosticLogFileInfo[];
} {
  return {
    directory: resolveDiagnosticLogDirectory(homeDir),
    files: listDiagnosticLogFiles(homeDir),
  };
}
