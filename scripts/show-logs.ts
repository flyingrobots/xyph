#!/usr/bin/env tsx

import { homedir } from 'node:os';
import {
  formatDiagnosticLogEntry,
  initialDiagnosticLogCursor,
  readDiagnosticLogEntries,
  readDiagnosticLogEntriesSince,
  resolveDiagnosticLogSummary,
  type DiagnosticLogReadCursor,
  type DiagnosticLogFileInfo,
} from '../src/infrastructure/logging/LogViewer.js';
import type { DiagnosticLogChannel } from '../src/infrastructure/logging/FileDiagnosticLogSink.js';

interface Args {
  homeDir: string;
  lines: number;
  channel: DiagnosticLogChannel | 'all';
  follow: boolean;
}

function parseArgs(argv: string[]): Args {
  let lines = 20;
  let channel: DiagnosticLogChannel | 'all' = 'all';
  let follow = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--lines') {
      const raw = argv[index + 1];
      const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`Invalid --lines value: ${raw ?? '(missing)'}`);
      }
      lines = parsed;
      index += 1;
      continue;
    }

    if (arg === '--channel') {
      const raw = argv[index + 1];
      if (raw !== 'actuator' && raw !== 'dashboard' && raw !== 'all') {
        throw new Error(`Invalid --channel value: ${raw ?? '(missing)'}`);
      }
      channel = raw;
      index += 1;
      continue;
    }

    if (arg === '--follow' || arg === '-f') {
      follow = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    homeDir: homedir(),
    lines,
    channel,
    follow,
  };
}

function printHelp(): void {
  console.log([
    'Usage: npm run logs -- [--channel all|actuator|dashboard] [--lines N] [--follow]',
    '',
    'Shows recent XYPH diagnostic log entries from ~/.xyph/logs.',
    'Examples:',
    '  npm run logs',
    '  npm run logs -- --channel actuator',
    '  npm run logs -- --channel dashboard --lines 50',
    '  npm run logs -- --follow',
  ].join('\n'));
}

function sectionTitle(file: DiagnosticLogFileInfo, lines: number): string {
  return `== ${file.channel} (${file.path})${lines > 0 ? ` — last ${lines} entr${lines === 1 ? 'y' : 'ies'}` : ''} ==`;
}

function render(file: DiagnosticLogFileInfo, lines: number): void {
  console.log('');
  console.log(sectionTitle(file, lines));
  if (!file.exists) {
    console.log('(missing)');
    return;
  }

  const entries = readDiagnosticLogEntries(file, lines);
  if (entries.length === 0) {
    console.log('(empty)');
    return;
  }

  for (const entry of entries) {
    console.log(formatDiagnosticLogEntry(entry));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function formatFollowEntry(entry: ReturnType<typeof readDiagnosticLogEntries>[number], showChannel: boolean): string {
  const base = formatDiagnosticLogEntry(entry);
  return showChannel ? `[${entry.channel}] ${base}` : base;
}

async function follow(
  files: DiagnosticLogFileInfo[],
  pollMs = 500,
): Promise<void> {
  const cursors = new Map<string, DiagnosticLogReadCursor>(
    files.map((file) => [file.path, initialDiagnosticLogCursor(file)] as const),
  );
  const showChannel = files.length > 1;

  console.log('');
  console.log(`Following XYPH logs. Press Ctrl-C to stop.`);

  while (true) {
    for (const file of files) {
      const currentCursor = cursors.get(file.path) ?? { offset: 0, remainder: '' };
      const result = readDiagnosticLogEntriesSince(file, currentCursor);
      cursors.set(file.path, result.cursor);
      for (const entry of result.entries) {
        console.log(formatFollowEntry(entry, showChannel));
      }
    }
    await sleep(pollMs);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const summary = resolveDiagnosticLogSummary(args.homeDir);
  const files = args.channel === 'all'
    ? summary.files
    : summary.files.filter((file) => file.channel === args.channel);

  console.log(`XYPH logs live in ${summary.directory}`);
  console.log(`Channels: ${summary.files.map((file) => `${file.channel}=${file.path}`).join('  ')}`);

  for (const file of files) {
    render(file, args.lines);
  }

  if (args.follow) {
    await follow(files);
  }
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
