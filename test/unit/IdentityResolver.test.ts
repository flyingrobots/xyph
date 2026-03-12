import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearIdentity,
  DEFAULT_AGENT_ID,
  parseAsOverrideFromArgv,
  resolveIdentity,
  userIdentityConfigPath,
  writeIdentity,
} from '../../src/cli/identity.js';

describe('identity resolution', () => {
  let repoPath: string;
  let homePath: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'xyph-identity-repo-'));
    homePath = fs.mkdtempSync(path.join(os.tmpdir(), 'xyph-identity-home-'));
    originalHome = process.env['HOME'];
    process.env['HOME'] = homePath;

    execSync('git init', { cwd: repoPath, stdio: 'ignore' });
  });

  afterEach(() => {
    if (originalHome === undefined) {
      Reflect.deleteProperty(process.env, 'HOME');
    } else {
      process.env['HOME'] = originalHome;
    }

    fs.rmSync(repoPath, { recursive: true, force: true });
    fs.rmSync(homePath, { recursive: true, force: true });
  });

  it('parses --as overrides from argv', () => {
    expect(parseAsOverrideFromArgv(['xyph', '--as', 'human.ada'])).toBe('human.ada');
    expect(parseAsOverrideFromArgv(['xyph', '--as=agent.hal'])).toBe('agent.hal');
    expect(parseAsOverrideFromArgv(['xyph', 'status'])).toBeUndefined();
  });

  it('resolves identity with the expected precedence order', () => {
    execSync('git config --global xyph.identity agent.global', { cwd: repoPath, stdio: 'ignore' });
    writeIdentity('agent.user', 'user', { homeDir: homePath });
    writeIdentity('human.local', 'local', { cwd: repoPath });

    expect(resolveIdentity({
      cwd: repoPath,
      cliOverride: 'human.flag',
      env: {},
      homeDir: homePath,
    })).toEqual({
      agentId: 'human.flag',
      source: 'flag',
      origin: '--as',
    });

    expect(resolveIdentity({
      cwd: repoPath,
      env: { XYPH_AGENT_ID: 'agent.env' },
      homeDir: homePath,
    })).toEqual({
      agentId: 'agent.env',
      source: 'env',
      origin: 'XYPH_AGENT_ID',
    });

    const local = resolveIdentity({
      cwd: repoPath,
      env: {},
      homeDir: homePath,
    });
    expect(local.agentId).toBe('human.local');
    expect(local.source).toBe('git-local');
    expect(local.origin).toContain('.git/config');

    clearIdentity('local', { cwd: repoPath });

    expect(resolveIdentity({
      cwd: repoPath,
      env: {},
      homeDir: homePath,
    })).toEqual({
      agentId: 'agent.user',
      source: 'user-config',
      origin: userIdentityConfigPath(homePath),
    });

    clearIdentity('user', { homeDir: homePath });

    const global = resolveIdentity({
      cwd: repoPath,
      env: {},
      homeDir: homePath,
    });
    expect(global.agentId).toBe('agent.global');
    expect(global.source).toBe('git-global');
    expect(global.origin).toContain('.gitconfig');

    clearIdentity('global', { cwd: repoPath });

    expect(resolveIdentity({
      cwd: repoPath,
      env: {},
      homeDir: homePath,
    })).toEqual({
      agentId: DEFAULT_AGENT_ID,
      source: 'default',
      origin: null,
    });
  });

  it('writes and clears the user identity config file', () => {
    const configPath = userIdentityConfigPath(homePath);

    writeIdentity('human.writer', 'user', { homeDir: homePath });
    expect(JSON.parse(fs.readFileSync(configPath, 'utf8'))).toEqual({ identity: 'human.writer' });

    clearIdentity('user', { homeDir: homePath });
    expect(fs.existsSync(configPath)).toBe(false);
  });
});
