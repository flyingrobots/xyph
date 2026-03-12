import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const DEFAULT_AGENT_ID = 'agent.prime';
export const XYPH_IDENTITY_KEY = 'xyph.identity';

export type IdentitySource =
  | 'flag'
  | 'env'
  | 'git-local'
  | 'user-config'
  | 'git-global'
  | 'default';

export interface ResolvedIdentity {
  agentId: string;
  source: IdentitySource;
  origin: string | null;
}

export interface ResolveIdentityOptions {
  cwd: string;
  cliOverride?: string;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
}

export type IdentityTarget = 'local' | 'global' | 'user';

interface GitIdentityValue {
  origin: string | null;
  value: string;
}

export function parseAsOverrideFromArgv(argv: readonly string[]): string | undefined {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--as') {
      const next = argv[i + 1];
      return typeof next === 'string' && next.trim() !== '' ? next.trim() : undefined;
    }
    if (typeof arg === 'string' && arg.startsWith('--as=')) {
      const value = arg.slice('--as='.length).trim();
      return value !== '' ? value : undefined;
    }
  }
  return undefined;
}

export function isPrincipalLike(value: string): boolean {
  return value.startsWith('human.') || value.startsWith('agent.');
}

export function assertPrincipalLike(value: string, label: string): void {
  if (!isPrincipalLike(value)) {
    throw new Error(`${label} must start with 'human.' or 'agent.', got: '${value}'`);
  }
}

export function userIdentityConfigPath(homeDir = homedir()): string {
  return join(homeDir, '.xyph', 'config');
}

export function resolveIdentity({
  cwd,
  cliOverride,
  env = process.env,
  homeDir = homedir(),
}: ResolveIdentityOptions): ResolvedIdentity {
  const override = cliOverride?.trim();
  if (override) {
    return { agentId: override, source: 'flag', origin: '--as' };
  }

  const envAgentId = env['XYPH_AGENT_ID']?.trim();
  if (envAgentId) {
    return { agentId: envAgentId, source: 'env', origin: 'XYPH_AGENT_ID' };
  }

  const localIdentity = readGitIdentity(cwd, 'local');
  if (localIdentity) {
    return { agentId: localIdentity.value, source: 'git-local', origin: localIdentity.origin };
  }

  const userIdentityPath = userIdentityConfigPath(homeDir);
  const userIdentity = readUserIdentity(userIdentityPath);
  if (userIdentity) {
    return { agentId: userIdentity, source: 'user-config', origin: userIdentityPath };
  }

  const globalIdentity = readGitIdentity(cwd, 'global');
  if (globalIdentity) {
    return { agentId: globalIdentity.value, source: 'git-global', origin: globalIdentity.origin };
  }

  return { agentId: DEFAULT_AGENT_ID, source: 'default', origin: null };
}

export function writeIdentity(
  agentId: string,
  target: IdentityTarget,
  opts?: { cwd?: string; homeDir?: string },
): { origin: string | null } {
  if (target === 'user') {
    const filePath = userIdentityConfigPath(opts?.homeDir);
    writeUserIdentity(filePath, agentId);
    return { origin: filePath };
  }

  writeGitIdentity(opts?.cwd ?? process.cwd(), target, agentId);
  const saved = readGitIdentity(opts?.cwd ?? process.cwd(), target);
  return { origin: saved?.origin ?? null };
}

export function clearIdentity(
  target: IdentityTarget,
  opts?: { cwd?: string; homeDir?: string },
): { origin: string | null } {
  if (target === 'user') {
    const filePath = userIdentityConfigPath(opts?.homeDir);
    clearUserIdentity(filePath);
    return { origin: filePath };
  }

  unsetGitIdentity(opts?.cwd ?? process.cwd(), target);
  const origin = target === 'local' ? '.git/config' : '~/.gitconfig';
  return { origin };
}

export function readUserIdentity(filePath: string): string | null {
  try {
    const raw = readFileSync(filePath, 'utf8').trim();
    if (raw === '') return null;

    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        const identity = (parsed as Record<string, unknown>)['identity'];
        return typeof identity === 'string' && identity.trim() !== ''
          ? identity.trim()
          : null;
      }
    } catch {
      // Support a legacy plain-text identity file.
    }

    return raw;
  } catch {
    return null;
  }
}

function readGitIdentity(cwd: string, target: Exclude<IdentityTarget, 'user'>): GitIdentityValue | null {
  try {
    const raw = execFileSync(
      'git',
      ['config', `--${target}`, '--show-origin', '--get', XYPH_IDENTITY_KEY],
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();

    if (raw === '') return null;

    const tabIndex = raw.indexOf('\t');
    if (tabIndex >= 0) {
      const origin = raw.slice(0, tabIndex).trim();
      const value = raw.slice(tabIndex + 1).trim();
      if (value === '') return null;
      return { origin: origin || null, value };
    }

    const spaceIndex = raw.indexOf(' ');
    if (spaceIndex >= 0) {
      const origin = raw.slice(0, spaceIndex).trim();
      const value = raw.slice(spaceIndex + 1).trim();
      if (value === '') return null;
      return { origin: origin || null, value };
    }

    return { origin: null, value: raw };
  } catch {
    return null;
  }
}

function writeGitIdentity(
  cwd: string,
  target: Exclude<IdentityTarget, 'user'>,
  agentId: string,
): void {
  execFileSync(
    'git',
    ['config', `--${target}`, XYPH_IDENTITY_KEY, agentId],
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

function unsetGitIdentity(
  cwd: string,
  target: Exclude<IdentityTarget, 'user'>,
): void {
  try {
    execFileSync(
      'git',
      ['config', `--${target}`, '--unset', XYPH_IDENTITY_KEY],
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
  } catch {
    // Missing keys are treated as already logged out.
  }
}

function writeUserIdentity(filePath: string, agentId: string): void {
  mkdirSync(dirname(filePath), { recursive: true });

  let existing: Record<string, unknown> = {};
  try {
    const raw = readFileSync(filePath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      existing = parsed as Record<string, unknown>;
    }
  } catch {
    existing = {};
  }

  existing['identity'] = agentId;
  writeFileSync(filePath, JSON.stringify(existing, null, 2) + '\n', 'utf8');
}

function clearUserIdentity(filePath: string): void {
  if (!existsSync(filePath)) return;

  try {
    const raw = readFileSync(filePath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      const next = { ...(parsed as Record<string, unknown>) };
      delete next['identity'];
      if (Object.keys(next).length === 0) {
        rmSync(filePath);
        return;
      }
      writeFileSync(filePath, JSON.stringify(next, null, 2) + '\n', 'utf8');
      return;
    }
  } catch {
    // Plain-text or malformed files are removed wholesale on logout.
  }

  rmSync(filePath);
}
