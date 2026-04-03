import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const createdDirs: string[] = [];

function makeExecutable(path: string, body: string): void {
  writeFileSync(path, body, 'utf8');
  chmodSync(path, 0o755);
}

function createHookFixture(): {
  repoDir: string;
  logPath: string;
} {
  const repoDir = mkdtempSync(join(tmpdir(), 'xyph-hooks-'));
  createdDirs.push(repoDir);

  mkdirSync(join(repoDir, 'bin'), { recursive: true });
  mkdirSync(join(repoDir, 'scripts', 'hooks'), { recursive: true });
  mkdirSync(join(repoDir, 'scripts'), { recursive: true });
  mkdirSync(join(repoDir, 'docs'), { recursive: true });

  writeFileSync(join(repoDir, 'README.md'), '# Hook Fixture\n', 'utf8');
  writeFileSync(join(repoDir, 'CONTRIBUTING.md'), '# Hook Fixture\n', 'utf8');
  writeFileSync(join(repoDir, 'docs', 'fixture.md'), 'No diagrams here.\n', 'utf8');

  writeFileSync(
    join(repoDir, 'scripts', 'hooks', 'pre-push'),
    readFileSync(join(process.cwd(), 'scripts', 'hooks', 'pre-push'), 'utf8'),
    'utf8',
  );
  chmodSync(join(repoDir, 'scripts', 'hooks', 'pre-push'), 0o755);

  writeFileSync(
    join(repoDir, 'scripts', 'hooks', 'pre-commit'),
    readFileSync(join(process.cwd(), 'scripts', 'hooks', 'pre-commit'), 'utf8'),
    'utf8',
  );
  chmodSync(join(repoDir, 'scripts', 'hooks', 'pre-commit'), 0o755);

  const logPath = join(repoDir, 'hook.log');

  makeExecutable(
    join(repoDir, 'bin', 'npm'),
    `#!/bin/sh
printf 'npm %s\\n' "$*" >> "$HOOK_LOG"
exit "\${HOOK_NPM_EXIT:-0}"
`,
  );

  makeExecutable(
    join(repoDir, 'scripts', 'check-diagrams.sh'),
    `#!/bin/sh
printf 'check-diagrams\\n' >> "$HOOK_LOG"
exit "\${HOOK_DIAGRAM_EXIT:-0}"
`,
  );

  makeExecutable(
    join(repoDir, 'scripts', 'check-graph-algorithms.sh'),
    `#!/bin/sh
printf 'check-graph-algorithms\\n' >> "$HOOK_LOG"
exit "\${HOOK_GRAPH_EXIT:-0}"
`,
  );

  return { repoDir, logPath };
}

function readLog(logPath: string): string {
  try {
    return readFileSync(logPath, 'utf8');
  } catch {
    return '';
  }
}

function runHook(
  repoDir: string,
  logPath: string,
  hookName: 'pre-commit' | 'pre-push',
  exits: {
    npm: number;
    diagrams?: number;
    graph?: number;
  },
): {
  status: number | null;
  stdout: string;
  stderr: string;
  log: string;
} {
  const result = spawnSync(
    'sh',
    [join('scripts', 'hooks', hookName)],
    {
      cwd: repoDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${join(repoDir, 'bin')}:${process.env.PATH ?? ''}`,
        HOOK_LOG: logPath,
        HOOK_NPM_EXIT: String(exits.npm),
        HOOK_DIAGRAM_EXIT: String(exits.diagrams ?? 0),
        HOOK_GRAPH_EXIT: String(exits.graph ?? 0),
      },
    },
  );

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    log: readLog(logPath),
  };
}

afterEach(() => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('git hook enforcement', () => {
  // @xyph criterion:pre-push-enforcing-fail-closed
  it('pre-push fails closed and stops before later checks when tests fail', () => {
    const { repoDir, logPath } = createHookFixture();

    const result = runHook(repoDir, logPath, 'pre-push', { npm: 1 });

    expect(result.status).toBe(1);
    expect(result.log).toBe('npm run test:local\n');
  });

  // @xyph criterion:pre-push-enforcing-pass-path
  it('pre-push still runs diagram checks when tests pass', () => {
    const { repoDir, logPath } = createHookFixture();

    const result = runHook(repoDir, logPath, 'pre-push', { npm: 0, diagrams: 0 });

    expect(result.status).toBe(0);
    expect(result.log).toBe('npm run test:local\ncheck-diagrams\n');
  });

  it('pre-commit fails closed and stops before later checks when lint fails', () => {
    const { repoDir, logPath } = createHookFixture();

    const result = runHook(repoDir, logPath, 'pre-commit', { npm: 1 });

    expect(result.status).toBe(1);
    expect(result.log).toBe('npm run lint\n');
  });

  it('pre-commit still runs graph checks when lint passes', () => {
    const { repoDir, logPath } = createHookFixture();

    const result = runHook(repoDir, logPath, 'pre-commit', { npm: 0, graph: 0 });

    expect(result.status).toBe(0);
    expect(result.log).toBe('npm run lint\ncheck-graph-algorithms\n');
  });
});
