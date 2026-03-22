import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { userConfigPath } from './identity.js';

export const DEFAULT_GRAPH_NAME = 'xyph';
const LOCAL_CONFIG_FILE = '.xyph.json';

export type GraphRuntimeSource = 'local-config' | 'user-config' | 'default';

export interface GraphRuntimeSelection {
  readonly graphName?: string;
  readonly repoPath?: string;
  readonly origin: string;
}

export interface ResolvedGraphRuntime {
  readonly cwd: string;
  readonly repoPath: string;
  readonly graphName: string;
  readonly source: GraphRuntimeSource;
  readonly origin: string | null;
}

interface RawGraphConfig {
  readonly name?: string;
  readonly repoPath?: string;
}

interface GraphConfigLayer {
  readonly graph: RawGraphConfig;
  readonly origin: string;
}

export function resolveGraphRuntime(opts?: {
  cwd?: string;
  homeDir?: string;
}): ResolvedGraphRuntime {
  const cwd = opts?.cwd ?? process.cwd();
  const localPath = join(cwd, LOCAL_CONFIG_FILE);
  const userPath = userConfigPath(opts?.homeDir ?? homedir());

  const localLayer = readGraphConfigLayer(localPath);
  const userLayer = readGraphConfigLayer(userPath);
  const selected = localLayer ?? userLayer;

  const workingRepoPath = tryNormalizeGitRepoPath(cwd);
  const configuredRepoPath = resolveConfiguredRepoPath(selected?.graph.repoPath, selected?.origin, cwd);
  const repoPath = normalizeGitRepoPath(configuredRepoPath);
  const graphName = resolveGraphName(selected, repoPath, workingRepoPath, cwd);

  return {
    cwd,
    repoPath,
    graphName,
    source: localLayer
      ? 'local-config'
      : userLayer
        ? 'user-config'
        : 'default',
    origin: selected?.origin ?? null,
  };
}

function readGraphConfigLayer(filePath: string): GraphConfigLayer | null {
  if (!existsSync(filePath)) return null;

  const parsed = readJsonObject(filePath);

  const graph = parsed['graph'];
  if (!isRecord(graph)) return null;

  const name = readOptionalString(graph, 'name');
  const repoPath = readOptionalString(graph, 'repoPath');
  if (name === undefined && repoPath === undefined) return null;

  return {
    graph: { ...(name === undefined ? {} : { name }), ...(repoPath === undefined ? {} : { repoPath }) },
    origin: filePath,
  };
}

function readJsonObject(filePath: string): Record<string, unknown> {
  const raw = readFileSync(filePath, 'utf8').trim();
  if (raw === '') {
    throw new Error(`Invalid XYPH config at ${filePath}: file is empty.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid XYPH config at ${filePath}: ${message}`);
  }

  if (!isRecord(parsed)) {
    throw new Error(`Invalid XYPH config at ${filePath}: expected a top-level JSON object.`);
  }

  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOptionalString(value: Record<string, unknown>, key: string): string | undefined {
  const raw = value[key];
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error(`Invalid ${key} in ${JSON.stringify(value)}: expected non-empty string.`);
  }
  return raw.trim();
}

function resolveConfiguredRepoPath(
  repoPath: string | undefined,
  origin: string | undefined,
  cwd: string,
): string {
  if (repoPath === undefined) return cwd;
  if (isAbsolute(repoPath)) return repoPath;
  return resolve(origin === undefined ? cwd : dirname(origin), repoPath);
}

function normalizeGitRepoPath(repoPath: string): string {
  try {
    return execFileSync(
      'git',
      ['rev-parse', '--show-toplevel'],
      { cwd: repoPath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
  } catch {
    throw new Error(`Configured graph repo is not a Git repository: ${repoPath}`);
  }
}

function tryNormalizeGitRepoPath(repoPath: string): string | null {
  try {
    return normalizeGitRepoPath(repoPath);
  } catch {
    return null;
  }
}

function resolveGraphName(
  layer: GraphConfigLayer | null,
  repoPath: string,
  workingRepoPath: string | null,
  cwd: string,
): string {
  if (layer?.graph.name !== undefined) return layer.graph.name;

  if (workingRepoPath === null) {
    throw new Error(
      [
        `XYPH can only auto-discover graph.name inside the current Git working repo.`,
        `The current working directory is not inside a Git repo: ${cwd}.`,
        `Set graph.name explicitly in ${LOCAL_CONFIG_FILE} or ${userConfigPath()} before running XYPH.`,
      ].join(' '),
    );
  }

  if (repoPath !== workingRepoPath) {
    throw new Error(
      [
        `XYPH will not inspect git-warp ref namespaces outside the current working repo.`,
        `Configured graph repo ${repoPath} is outside the working repo ${workingRepoPath}.`,
        `Set graph.name explicitly in ${LOCAL_CONFIG_FILE} or ${userConfigPath()} before running XYPH.`,
      ].join(' '),
    );
  }

  const graphs = listWarpGraphNames(repoPath);
  if (graphs.length === 0) return DEFAULT_GRAPH_NAME;
  if (graphs.length === 1 && graphs[0] === DEFAULT_GRAPH_NAME) {
    return DEFAULT_GRAPH_NAME;
  }

  if (graphs.length === 1) {
    throw new Error(
      [
        `XYPH found one git-warp graph in ${repoPath}: ${graphs[0]}.`,
        `Set graph.name explicitly in ${LOCAL_CONFIG_FILE} or ${userConfigPath()} before running XYPH.`,
        `Defaulting to '${DEFAULT_GRAPH_NAME}' here would silently create a second graph.`,
      ].join(' '),
    );
  }

  throw new Error(
    [
      `XYPH found multiple git-warp graphs in ${repoPath}: ${graphs.join(', ')}.`,
      `Set graph.name explicitly in ${LOCAL_CONFIG_FILE} or ${userConfigPath()} so XYPH does not guess.`,
    ].join(' '),
  );
}

function listWarpGraphNames(repoPath: string): string[] {
  try {
    const raw = execFileSync(
      'git',
      ['for-each-ref', '--format=%(refname)', 'refs/warp'],
      { cwd: repoPath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );

    const names = new Set<string>();
    for (const line of raw.split('\n')) {
      const ref = line.trim();
      if (ref === '') continue;
      const match = /^refs\/warp\/([^/]+)\//.exec(ref);
      if (match?.[1]) names.add(match[1]);
    }
    return [...names].sort();
  } catch {
    return [];
  }
}
