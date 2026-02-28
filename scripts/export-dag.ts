#!/usr/bin/env -S npx tsx
/**
 * Export the XYPH dependency DAG as a Graphviz DOT file and render to SVG.
 *
 * Usage: npx tsx scripts/export-dag.ts [output.svg]
 */

import WarpGraph, { GitGraphAdapter } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { normalizeQuestStatus } from '../src/domain/entities/Quest.js';
import { computeTopBlockers, type TaskSummary, type DepEdge } from '../src/domain/services/DepAnalysis.js';

const WRITER_ID = process.env['XYPH_AGENT_ID'] ?? 'agent.prime';
const outputFile = process.argv[2] ?? 'roadmap-dag.svg';

const plumbing = Plumbing.createDefault({ cwd: process.cwd() });
const persistence = new GitGraphAdapter({ plumbing });

// Colors by normalized status
const STATUS_COLORS: Record<string, { fill: string; font: string; border: string }> = {
  DONE:        { fill: '#2d5016', font: '#b8e6a0', border: '#4a8c28' },
  IN_PROGRESS: { fill: '#1a4a6e', font: '#a0d4f7', border: '#2980b9' },
  PLANNED:     { fill: '#4a3560', font: '#c9a0f7', border: '#7b52a0' },
  BACKLOG:     { fill: '#3a3a3a', font: '#cccccc', border: '#666666' },
  GRAVEYARD:   { fill: '#2a1a1a', font: '#996666', border: '#553333' },
};

// Colors by campaign
const CAMPAIGN_COLORS: Record<string, string> = {
  'campaign:CLITOOL':   '#e67e22',
  'campaign:DASHBOARD': '#2ecc71',
  'campaign:AGENT':     '#e74c3c',
  'campaign:ORACLE':    '#9b59b6',
  'campaign:FORGE':     '#f39c12',
  'campaign:WEAVER':    '#1abc9c',
  'campaign:TRIAGE':    '#3498db',
  'campaign:BEDROCK':   '#95a5a6',
  'campaign:HEARTBEAT': '#95a5a6',
  'campaign:SOVEREIGNTY': '#95a5a6',
  'campaign:SUBMISSION': '#95a5a6',
};

interface TaskNode {
  id: string;
  title: string;
  status: string;
  campaign: string | null;
  deps: string[];
}

async function main(): Promise<void> {
  const graph = await WarpGraph.open({
    persistence,
    graphName: 'xyph-roadmap',
    writerId: WRITER_ID,
    autoMaterialize: true,
  });
  await graph.syncCoverage();
  await graph.materialize();

  const allNodes = await graph.getNodes();
  const taskIds = allNodes.filter((n) => n.startsWith('task:'));

  // Build task map
  const tasks = new Map<string, TaskNode>();
  for (const id of taskIds) {
    const props = await graph.getNodeProps(id);
    if (!props) continue;

    const rawStatus = (props.get('status') as string) ?? 'BACKLOG';
    const status = normalizeQuestStatus(rawStatus);
    const title = (props.get('title') as string) ?? id;

    // Find campaign via belongs-to edge
    const neighbors = (await graph.neighbors(id, 'outgoing')) as Array<{
      label: string;
      nodeId: string;
    }>;
    const campaignEdge = neighbors.find(
      (n) => n.label === 'belongs-to' && n.nodeId.startsWith('campaign:'),
    );

    // Find depends-on edges
    const deps = neighbors
      .filter((n) => n.label === 'depends-on')
      .map((n) => n.nodeId);

    tasks.set(id, {
      id,
      title: title.slice(0, 50),
      status,
      campaign: campaignEdge?.nodeId ?? null,
      deps,
    });
  }

  // Only include tasks that have deps or are depended upon (skip isolated DONE tasks)
  const inDag = new Set<string>();
  for (const [id, task] of tasks) {
    if (task.deps.length > 0) {
      inDag.add(id);
      for (const dep of task.deps) inDag.add(dep);
    }
  }

  // Also include frontier tasks (non-DONE, no deps, but depended on by others)
  for (const id of taskIds) {
    const task = tasks.get(id);
    if (task && task.status !== 'DONE' && inDag.has(id)) {
      inDag.add(id);
    }
  }

  // Compute frontier: non-DONE tasks whose deps are all DONE (or have no deps)
  const frontier = new Set<string>();
  for (const [id, task] of tasks) {
    if (task.status === 'DONE') continue;
    if (!inDag.has(id)) continue;
    const blocked = task.deps.some((dep) => {
      const depTask = tasks.get(dep);
      return depTask && depTask.status !== 'DONE';
    });
    if (!blocked) frontier.add(id);
  }

  // Compute top blockers
  const depAnalysisTasks: TaskSummary[] = [...tasks.values()].map(t => ({
    id: t.id, status: t.status, hours: 0,
  }));
  const depAnalysisEdges: DepEdge[] = [...tasks.values()].flatMap(t =>
    t.deps.map(dep => ({ from: t.id, to: dep })),
  );
  const topBlockers = computeTopBlockers(depAnalysisTasks, depAnalysisEdges, 10);
  const topBlockerSet = new Set(topBlockers.map(b => b.id));
  const blockerTransitive = new Map(topBlockers.map(b => [b.id, b.transitiveCount]));

  // Group by campaign for subgraph clustering
  const byCampaign = new Map<string, string[]>();
  for (const id of inDag) {
    const task = tasks.get(id);
    if (!task) continue;
    const key = task.campaign ?? '(none)';
    const arr = byCampaign.get(key) ?? [];
    arr.push(id);
    byCampaign.set(key, arr);
  }

  // Generate DOT
  const lines: string[] = [];
  lines.push('digraph XYPH {');
  lines.push('  rankdir=TB;');
  lines.push('  bgcolor="#1a1a2e";');
  lines.push('  node [shape=box, style="filled,rounded", fontname="Helvetica", fontsize=10, margin="0.15,0.08"];');
  lines.push('  edge [color="#555555", arrowsize=0.7];');
  lines.push('  graph [fontname="Helvetica", fontsize=12, fontcolor="#cccccc"];');
  lines.push('');

  let clusterIdx = 0;
  for (const [campaign, ids] of byCampaign) {
    const campaignColor = CAMPAIGN_COLORS[campaign] ?? '#666666';
    const label = campaign === '(none)' ? 'Unassigned' : campaign.replace('campaign:', 'M: ');

    lines.push(`  subgraph cluster_${clusterIdx++} {`);
    lines.push(`    label="${label}";`);
    lines.push(`    style=dashed;`);
    lines.push(`    color="${campaignColor}";`);
    lines.push(`    fontcolor="${campaignColor}";`);
    lines.push('');

    for (const id of ids) {
      const task = tasks.get(id);
      if (!task) continue;
      const isFrontier = frontier.has(id);
      const isBlocker = topBlockerSet.has(id);
      const sc = isFrontier
        ? { fill: '#5c4a00', font: '#ffd700', border: '#daa520' }
        : STATUS_COLORS[task.status] ?? STATUS_COLORS['BACKLOG'];
      const shortId = id.replace('task:', '');
      const transCount = blockerTransitive.get(id);
      const blockerTag = isBlocker && transCount ? ` [blocks ${transCount}]` : '';
      const frontierTag = isFrontier && !isBlocker ? ' *' : '';
      const label = `${shortId}${frontierTag}${blockerTag}\\n${task.title.slice(0, 35)}`;
      const penwidth = isBlocker ? ', penwidth=3' : '';
      const borderColor = isBlocker ? '#ff4444' : sc.border;
      lines.push(
        `    "${id}" [label="${label}", fillcolor="${sc.fill}", fontcolor="${sc.font}", color="${borderColor}"${penwidth}];`,
      );
    }

    lines.push('  }');
    lines.push('');
  }

  // Edges: prerequisite → dependent (work flows left to right)
  for (const id of inDag) {
    const task = tasks.get(id);
    if (!task) continue;
    for (const dep of task.deps) {
      if (!inDag.has(dep)) continue;
      const depTask = tasks.get(dep);
      const edgeColor = depTask?.status === 'DONE' ? '#4a8c28' : '#888888';
      // Reverse: dep (prerequisite) → id (dependent)
      lines.push(`  "${dep}" -> "${id}" [color="${edgeColor}"];`);
    }
  }

  // Legend
  lines.push('');
  lines.push('  subgraph cluster_legend {');
  lines.push('    label="Legend";');
  lines.push('    style=dashed;');
  lines.push('    color="#444444";');
  lines.push('    fontcolor="#999999";');
  lines.push('    "leg_done" [label="DONE", fillcolor="#2d5016", fontcolor="#b8e6a0", color="#4a8c28"];');
  lines.push('    "leg_wip" [label="IN_PROGRESS", fillcolor="#1a4a6e", fontcolor="#a0d4f7", color="#2980b9"];');
  lines.push('    "leg_frontier" [label="FRONTIER (ready)", fillcolor="#5c4a00", fontcolor="#ffd700", color="#daa520"];');
  lines.push('    "leg_planned" [label="PLANNED", fillcolor="#4a3560", fontcolor="#c9a0f7", color="#7b52a0"];');
  lines.push('    "leg_backlog" [label="BACKLOG", fillcolor="#3a3a3a", fontcolor="#cccccc", color="#666666"];');
  lines.push('    "leg_done" -> "leg_wip" -> "leg_frontier" -> "leg_planned" -> "leg_backlog" [style=invis];');
  lines.push('  }');

  lines.push('}');

  const dotContent = lines.join('\n');
  const dotFile = outputFile.replace(/\.svg$/, '.dot');
  writeFileSync(dotFile, dotContent);
  console.log(`DOT: ${dotFile} (${inDag.size} nodes)`);

  // Render SVG
  try {
    execSync(`dot -Tsvg "${dotFile}" -o "${outputFile}"`, { stdio: 'pipe' });
    console.log(`SVG: ${outputFile}`);
  } catch (err) {
    console.error('Failed to render SVG — is graphviz installed? (`brew install graphviz`)');
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`[FATAL] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
