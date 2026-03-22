import { WarpGraph, GitGraphAdapter } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';

const DEFAULT_GRAPH_NAME = 'xyph';

function readGraphConfig(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    const raw = readFileSync(filePath, 'utf8').trim();
    if (raw === '') return null;
    const parsed = JSON.parse(raw);
    const graph = parsed?.graph;
    if (!graph || typeof graph !== 'object' || Array.isArray(graph)) return null;
    const name = typeof graph.name === 'string' && graph.name.trim() !== '' ? graph.name.trim() : undefined;
    const repoPath = typeof graph.repoPath === 'string' && graph.repoPath.trim() !== '' ? graph.repoPath.trim() : undefined;
    if (name === undefined && repoPath === undefined) return null;
    return { graph: { name, repoPath }, origin: filePath };
  } catch {
    return null;
  }
}

function normalizeRepoPath(repoPath) {
  return execFileSync(
    'git',
    ['rev-parse', '--show-toplevel'],
    { cwd: repoPath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  ).trim();
}

function listGraphNames(repoPath) {
  const raw = execFileSync(
    'git',
    ['for-each-ref', '--format=%(refname)', 'refs/warp'],
    { cwd: repoPath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const names = new Set();
  for (const line of raw.split('\n')) {
    const match = /^refs\/warp\/([^/]+)\//.exec(line.trim());
    if (match?.[1]) names.add(match[1]);
  }
  return [...names].sort();
}

function resolveGraphRuntime() {
  const cwd = process.cwd();
  const localPath = join(cwd, '.xyph.json');
  const userPath = join(homedir(), '.xyph', 'config');
  const selected = readGraphConfig(localPath) ?? readGraphConfig(userPath);
  const configuredRepoPath = selected?.graph.repoPath;
  const rawRepoPath = configuredRepoPath === undefined
    ? cwd
    : isAbsolute(configuredRepoPath)
      ? configuredRepoPath
      : resolve(dirname(selected.origin), configuredRepoPath);
  const repoPath = normalizeRepoPath(rawRepoPath);

  if (selected?.graph.name) {
    return { repoPath, graphName: selected.graph.name };
  }

  const graphNames = listGraphNames(repoPath);
  if (graphNames.length === 0) {
    return { repoPath, graphName: DEFAULT_GRAPH_NAME };
  }
  if (graphNames.length === 1 && graphNames[0] === DEFAULT_GRAPH_NAME) {
    return { repoPath, graphName: DEFAULT_GRAPH_NAME };
  }

  throw new Error(
    `Set graph.name explicitly in .xyph.json or ~/.xyph/config before running this script. Found: ${graphNames.join(', ')}`,
  );
}

const runtime = resolveGraphRuntime();
const plumbing = Plumbing.createDefault({ cwd: runtime.repoPath });
const persistence = new GitGraphAdapter({ plumbing });

async function setup() {
  const graph = await WarpGraph.open({
    persistence,
    graphName: runtime.graphName,
    writerId: 'agent.james',
    autoMaterialize: true,
  });

  await graph.syncCoverage();
  const patch = await graph.createPatch();
  
  patch.addNode('campaign:HEARTBEAT')
    .setProperty('campaign:HEARTBEAT', 'title', 'Milestone 2: The Heartbeat')
    .setProperty('campaign:HEARTBEAT', 'status', 'BACKLOG')
    .setProperty('campaign:HEARTBEAT', 'type', 'task')
    .addEdge('campaign:HEARTBEAT', 'roadmap:ROOT', 'belongs-to');
    
  const sha = await patch.commit();
  console.log(`Campaign HEARTBEAT initialized: ${sha}`);
}

setup().catch(console.error);
