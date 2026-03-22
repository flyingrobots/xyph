import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_GRAPH_NAME, resolveGraphRuntime } from '../../src/cli/runtimeGraph.js';

describe('graph runtime resolution', () => {
  let workspacePath: string;
  let repoPath: string;
  let secondaryRepoPath: string;
  let homePath: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'xyph-graph-workspace-'));
    repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'xyph-graph-repo-'));
    secondaryRepoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'xyph-graph-secondary-repo-'));
    homePath = fs.mkdtempSync(path.join(os.tmpdir(), 'xyph-graph-home-'));
    originalHome = process.env['HOME'];
    process.env['HOME'] = homePath;

    execSync('git init', { cwd: repoPath, stdio: 'ignore' });
    execSync('git config user.email "test@xyph.dev"', { cwd: repoPath, stdio: 'ignore' });
    execSync('git config user.name "Test Runner"', { cwd: repoPath, stdio: 'ignore' });
    execSync('git commit --allow-empty -m init', { cwd: repoPath, stdio: 'ignore' });

    execSync('git init', { cwd: secondaryRepoPath, stdio: 'ignore' });
    execSync('git config user.email "test@xyph.dev"', { cwd: secondaryRepoPath, stdio: 'ignore' });
    execSync('git config user.name "Test Runner"', { cwd: secondaryRepoPath, stdio: 'ignore' });
    execSync('git commit --allow-empty -m init', { cwd: secondaryRepoPath, stdio: 'ignore' });
  });

  afterEach(() => {
    if (originalHome === undefined) {
      Reflect.deleteProperty(process.env, 'HOME');
    } else {
      process.env['HOME'] = originalHome;
    }

    fs.rmSync(workspacePath, { recursive: true, force: true });
    fs.rmSync(repoPath, { recursive: true, force: true });
    fs.rmSync(secondaryRepoPath, { recursive: true, force: true });
    fs.rmSync(homePath, { recursive: true, force: true });
  });

  it('defaults to xyph when the repo has no warp graphs yet', () => {
    const resolved = resolveGraphRuntime({ cwd: repoPath, homeDir: homePath });

    expect(resolved.repoPath).toBe(canonicalRepoPath(repoPath));
    expect(resolved.graphName).toBe(DEFAULT_GRAPH_NAME);
    expect(resolved.source).toBe('default');
  });

  it('fails loudly when the repo has one non-default warp graph and no explicit config', () => {
    seedGraphRef(repoPath, 'xyph-roadmap');

    expect(() => resolveGraphRuntime({ cwd: repoPath, homeDir: homePath })).toThrow(
      /silently create a second graph/i,
    );
  });

  it('fails loudly when the repo has multiple warp graphs and no explicit config', () => {
    seedGraphRef(repoPath, 'xyph');
    seedGraphRef(repoPath, 'xyph-roadmap');

    expect(() => resolveGraphRuntime({ cwd: repoPath, homeDir: homePath })).toThrow(
      /multiple git-warp graphs/i,
    );
  });

  it('uses local .xyph.json graph settings before user config', () => {
    seedGraphRef(repoPath, 'xyph-roadmap');

    fs.writeFileSync(
      path.join(workspacePath, '.xyph.json'),
      JSON.stringify({ graph: { repoPath, name: 'xyph-roadmap' } }, null, 2),
    );
    fs.mkdirSync(path.join(homePath, '.xyph'), { recursive: true });
    fs.writeFileSync(
      path.join(homePath, '.xyph', 'config'),
      JSON.stringify({ graph: { repoPath, name: 'xyph' } }, null, 2),
    );

    const resolved = resolveGraphRuntime({ cwd: workspacePath, homeDir: homePath });

    expect(resolved.repoPath).toBe(canonicalRepoPath(repoPath));
    expect(resolved.graphName).toBe('xyph-roadmap');
    expect(resolved.source).toBe('local-config');
    expect(resolved.origin).toBe(path.join(workspacePath, '.xyph.json'));
  });

  it('uses ~/.xyph/config graph settings when local config is absent', () => {
    seedGraphRef(repoPath, 'xyph-roadmap');
    fs.mkdirSync(path.join(homePath, '.xyph'), { recursive: true });
    fs.writeFileSync(
      path.join(homePath, '.xyph', 'config'),
      JSON.stringify({ identity: 'human.tester', graph: { repoPath, name: 'xyph-roadmap' } }, null, 2),
    );

    const resolved = resolveGraphRuntime({ cwd: workspacePath, homeDir: homePath });

    expect(resolved.repoPath).toBe(canonicalRepoPath(repoPath));
    expect(resolved.graphName).toBe('xyph-roadmap');
    expect(resolved.source).toBe('user-config');
    expect(resolved.origin).toBe(path.join(homePath, '.xyph', 'config'));
  });

  it('fails loudly when local .xyph.json exists but is invalid JSON', () => {
    fs.writeFileSync(path.join(workspacePath, '.xyph.json'), '{ not-json');

    expect(() => resolveGraphRuntime({ cwd: workspacePath, homeDir: homePath })).toThrow(
      /Invalid XYPH config at .*\.xyph\.json/i,
    );
  });

  it('requires graph.name when the current working directory is not inside a Git repo', () => {
    fs.mkdirSync(path.join(homePath, '.xyph'), { recursive: true });
    fs.writeFileSync(
      path.join(homePath, '.xyph', 'config'),
      JSON.stringify({ graph: { repoPath } }, null, 2),
    );

    expect(() => resolveGraphRuntime({ cwd: workspacePath, homeDir: homePath })).toThrow(
      /can only auto-discover graph.name inside the current Git working repo/i,
    );
  });

  it('requires graph.name when repoPath points outside the current working repo', () => {
    fs.mkdirSync(path.join(homePath, '.xyph'), { recursive: true });
    fs.writeFileSync(
      path.join(homePath, '.xyph', 'config'),
      JSON.stringify({ graph: { repoPath } }, null, 2),
    );

    expect(() => resolveGraphRuntime({ cwd: secondaryRepoPath, homeDir: homePath })).toThrow(
      /will not inspect git-warp ref namespaces outside the current working repo/i,
    );
  });
});

function seedGraphRef(repoPath: string, graphName: string): void {
  const head = execSync('git rev-parse HEAD', { cwd: repoPath, encoding: 'utf8' }).trim();
  execSync(
    `git update-ref refs/warp/${graphName}/writers/agent.prime ${head}`,
    { cwd: repoPath, stdio: 'ignore' },
  );
}

function canonicalRepoPath(repoPath: string): string {
  return execSync('git rev-parse --show-toplevel', {
    cwd: repoPath,
    encoding: 'utf8',
  }).trim();
}
