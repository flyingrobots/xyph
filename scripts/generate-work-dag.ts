#!/usr/bin/env -S npx tsx
/**
 * Generate the XYPH Work DAG analysis suite.
 *
 * Produces:
 *   docs/work/all-hr.svg, all-vert.svg       — full DAG in both orientations
 *   docs/work/<campaign>/<name>-hr/vert.svg   — per-campaign views
 *   docs/work/backlog-hr.svg, backlog-vert.svg
 *   docs/work/graveyard-hr.svg, graveyard-vert.svg
 *   docs/work/work.md                         — full analysis document
 *
 * Usage: npx tsx scripts/generate-work-dag.ts
 */

import WarpGraph, { GitGraphAdapter } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeQuestStatus } from '../src/domain/entities/Quest.js';
import {
  computeFrontier,
  computeTopBlockers,
  computeCriticalPath,
  type TaskSummary,
  type DepEdge,
} from '../src/domain/services/DepAnalysis.js';
import {
  computeLevels,
  dagWidth,
  scheduleWorkers,
  transitiveReduction,
  transitiveClosure,
  computeAntiChains,
  computeProvenance,
} from '../src/domain/services/DagAnalysis.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WRITER_ID = process.env['XYPH_AGENT_ID'] ?? 'agent.prime';
const OUTPUT_DIR = join(process.cwd(), 'docs', 'work');
const WORKERS = 4;

// Dark theme colors
const STATUS_COLORS: Record<string, { fill: string; font: string; border: string }> = {
  DONE:        { fill: '#2d5016', font: '#b8e6a0', border: '#4a8c28' },
  IN_PROGRESS: { fill: '#1a4a6e', font: '#a0d4f7', border: '#2980b9' },
  PLANNED:     { fill: '#4a3560', font: '#c9a0f7', border: '#7b52a0' },
  BACKLOG:     { fill: '#3a3a3a', font: '#cccccc', border: '#666666' },
  GRAVEYARD:   { fill: '#2a1a1a', font: '#996666', border: '#553333' },
};

const DEFAULT_COLORS = { fill: '#3a3a3a', font: '#cccccc', border: '#666666' };
const FRONTIER_COLORS = { fill: '#5c4a00', font: '#ffd700', border: '#daa520' };

const CAMPAIGN_COLORS: Record<string, string> = {
  'campaign:CLITOOL':      '#e67e22',
  'campaign:DASHBOARD':    '#2ecc71',
  'campaign:AGENT':        '#e74c3c',
  'campaign:ORACLE':       '#9b59b6',
  'campaign:FORGE':        '#f39c12',
  'campaign:WEAVER':       '#1abc9c',
  'campaign:TRIAGE':       '#3498db',
  'campaign:BEDROCK':      '#95a5a6',
  'campaign:HEARTBEAT':    '#95a5a6',
  'campaign:SOVEREIGNTY':  '#95a5a6',
  'campaign:SUBMISSION':   '#95a5a6',
  'campaign:TRACEABILITY': '#16a085',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TaskNode {
  id: string;
  title: string;
  status: string;
  hours: number;
  campaign: string | null;
  campaignTitle: string | null;
  deps: string[];
}

interface DotOptions {
  rankdir: 'LR' | 'TB';
  title?: string;
  filter?: (t: TaskNode) => boolean;
  highlightPath?: Set<string>;
  highlightFrontier?: Set<string>;
  highlightBlockers?: Set<string>;
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadGraph(): Promise<{
  tasks: Map<string, TaskNode>;
  campaigns: Map<string, string>;
  sorted: string[];
}> {
  const plumbing = Plumbing.createDefault({ cwd: process.cwd() });
  const persistence = new GitGraphAdapter({ plumbing });

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
  const campaignIds = allNodes.filter((n) => n.startsWith('campaign:') || n.startsWith('milestone:'));

  // Load campaign titles
  const campaigns = new Map<string, string>();
  for (const cid of campaignIds) {
    const props = await graph.getNodeProps(cid);
    if (props) {
      campaigns.set(cid, (props.get('title') as string) ?? cid.replace(/^(campaign|milestone):/, ''));
    }
  }

  // Load tasks
  const tasks = new Map<string, TaskNode>();
  for (const id of taskIds) {
    const props = await graph.getNodeProps(id);
    if (!props) continue;

    const rawStatus = (props.get('status') as string) ?? 'BACKLOG';
    const status = normalizeQuestStatus(rawStatus);
    const title = (props.get('title') as string) ?? id;
    const hours = Number(props.get('hours') ?? 1);

    const neighbors = (await graph.neighbors(id, 'outgoing')) as Array<{
      label: string;
      nodeId: string;
    }>;

    const campaignEdge = neighbors.find(
      (n) => n.label === 'belongs-to' && (n.nodeId.startsWith('campaign:') || n.nodeId.startsWith('milestone:')),
    );

    const deps = neighbors
      .filter((n) => n.label === 'depends-on')
      .map((n) => n.nodeId);

    const campaignId = campaignEdge?.nodeId ?? null;
    tasks.set(id, {
      id,
      title,
      status,
      hours: Number.isFinite(hours) ? hours : 1,
      campaign: campaignId,
      campaignTitle: campaignId ? (campaigns.get(campaignId) ?? null) : null,
      deps,
    });
  }

  // Topological sort via git-warp (prerequisites before dependents)
  const topoResult = await graph.traverse.topologicalSort(taskIds, {
    dir: 'in',
    labelFilter: 'depends-on',
  });
  const sorted = topoResult.sorted;

  return { tasks, campaigns, sorted };
}

// ---------------------------------------------------------------------------
// DOT generation
// ---------------------------------------------------------------------------

function escapeLabel(s: string): string {
  return s.replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function generateDot(
  allTasks: Map<string, TaskNode>,
  opts: DotOptions,
): string {
  const filteredIds = new Set<string>();
  for (const [id, task] of allTasks) {
    if (!opts.filter || opts.filter(task)) {
      filteredIds.add(id);
    }
  }

  // Also include deps of filtered tasks that exist
  const inDag = new Set<string>(filteredIds);
  for (const id of filteredIds) {
    const task = allTasks.get(id);
    if (task) {
      for (const dep of task.deps) {
        if (allTasks.has(dep)) inDag.add(dep);
      }
    }
  }

  // Group by campaign
  const byCampaign = new Map<string, string[]>();
  for (const id of inDag) {
    const task = allTasks.get(id);
    if (!task) continue;
    const key = task.campaign ?? '(none)';
    const arr = byCampaign.get(key) ?? [];
    arr.push(id);
    byCampaign.set(key, arr);
  }

  const lines: string[] = [];
  lines.push('digraph XYPH {');
  lines.push(`  rankdir=${opts.rankdir};`);
  lines.push('  bgcolor="#1a1a2e";');
  lines.push('  node [shape=box, style="filled,rounded", fontname="Helvetica", fontsize=10, margin="0.15,0.08"];');
  lines.push('  edge [color="#555555", arrowsize=0.7];');
  lines.push('  graph [fontname="Helvetica", fontsize=12, fontcolor="#cccccc"];');

  if (opts.title) {
    lines.push(`  label="${escapeLabel(opts.title)}";`);
    lines.push('  labelloc=t;');
    lines.push('  fontsize=16;');
  }

  lines.push('');

  let clusterIdx = 0;
  for (const [campaign, ids] of byCampaign) {
    const campaignColor = CAMPAIGN_COLORS[campaign] ?? '#666666';
    const task0 = ids[0] ? allTasks.get(ids[0]) : undefined;
    const label = campaign === '(none)'
      ? 'Unassigned'
      : (task0?.campaignTitle ?? campaign.replace(/^(campaign|milestone):/, 'M: '));

    lines.push(`  subgraph cluster_${clusterIdx++} {`);
    lines.push(`    label="${escapeLabel(label)}";`);
    lines.push('    style=dashed;');
    lines.push(`    color="${campaignColor}";`);
    lines.push(`    fontcolor="${campaignColor}";`);
    lines.push('');

    for (const id of ids) {
      const task = allTasks.get(id);
      if (!task) continue;

      const isFrontier = opts.highlightFrontier?.has(id) ?? false;
      const isBlocker = opts.highlightBlockers?.has(id) ?? false;
      const isCritical = opts.highlightPath?.has(id) ?? false;

      const sc = isFrontier
        ? FRONTIER_COLORS
        : STATUS_COLORS[task.status] ?? DEFAULT_COLORS;

      const shortId = id.replace('task:', '');
      const tags: string[] = [];
      if (isCritical) tags.push('CP');
      if (isFrontier) tags.push('*');
      const tagStr = tags.length > 0 ? ` [${tags.join(',')}]` : '';
      const truncTitle = task.title.length > 35 ? task.title.slice(0, 35) : task.title;
      const label = `${shortId}${tagStr}\\n${escapeLabel(truncTitle)}`;

      const penwidth = isBlocker || isCritical ? ', penwidth=3' : '';
      const borderColor = isBlocker ? '#ff4444' : (isCritical ? '#ff8800' : sc.border);

      lines.push(
        `    "${id}" [label="${label}", fillcolor="${sc.fill}", fontcolor="${sc.font}", color="${borderColor}"${penwidth}];`,
      );
    }

    lines.push('  }');
    lines.push('');
  }

  // Edges: prerequisite → dependent (work flows in rankdir direction)
  for (const id of inDag) {
    const task = allTasks.get(id);
    if (!task) continue;
    for (const dep of task.deps) {
      if (!inDag.has(dep)) continue;
      const depTask = allTasks.get(dep);
      const edgeColor = depTask?.status === 'DONE' ? '#4a8c28' : '#888888';
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
  lines.push('    "leg_frontier" [label="FRONTIER", fillcolor="#5c4a00", fontcolor="#ffd700", color="#daa520"];');
  lines.push('    "leg_planned" [label="PLANNED", fillcolor="#4a3560", fontcolor="#c9a0f7", color="#7b52a0"];');
  lines.push('    "leg_backlog" [label="BACKLOG", fillcolor="#3a3a3a", fontcolor="#cccccc", color="#666666"];');
  lines.push('    "leg_done" -> "leg_wip" -> "leg_frontier" -> "leg_planned" -> "leg_backlog" [style=invis];');
  lines.push('  }');

  lines.push('}');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// SVG rendering
// ---------------------------------------------------------------------------

function renderSvg(dotContent: string, outputPath: string): void {
  const dotFile = outputPath.replace(/\.svg$/, '.dot');
  writeFileSync(dotFile, dotContent);
  try {
    execSync(`dot -Tsvg "${dotFile}" -o "${outputPath}"`, { stdio: 'pipe' });
    console.log(`  SVG: ${outputPath}`);
  } catch (err) {
    console.error(`  FAIL: ${outputPath} — is graphviz installed? (brew install graphviz)`);
    console.error(err instanceof Error ? err.message : String(err));
  }
}

function generatePair(
  allTasks: Map<string, TaskNode>,
  dir: string,
  baseName: string,
  opts: Omit<DotOptions, 'rankdir'>,
): void {
  const hrDot = generateDot(allTasks, { ...opts, rankdir: 'LR' });
  const vtDot = generateDot(allTasks, { ...opts, rankdir: 'TB' });
  renderSvg(hrDot, join(dir, `${baseName}-hr.svg`));
  renderSvg(vtDot, join(dir, `${baseName}-vert.svg`));
}

// ---------------------------------------------------------------------------
// Analysis helpers
// ---------------------------------------------------------------------------

function buildAnalysisInputs(
  tasks: Map<string, TaskNode>,
): {
  summaries: TaskSummary[];
  edges: DepEdge[];
} {
  const summaries: TaskSummary[] = [];
  const edges: DepEdge[] = [];

  for (const [, task] of tasks) {
    summaries.push({ id: task.id, status: task.status, hours: task.hours });
    for (const dep of task.deps) {
      if (tasks.has(dep)) {
        edges.push({ from: task.id, to: dep });
      }
    }
  }

  return { summaries, edges };
}

// ---------------------------------------------------------------------------
// work.md generation
// ---------------------------------------------------------------------------

function generateWorkMd(
  tasks: Map<string, TaskNode>,
  summaries: TaskSummary[],
  edges: DepEdge[],
  sorted: string[],
): string {
  const lines: string[] = [];
  const now = new Date().toISOString().slice(0, 10);

  // Header
  lines.push('# XYPH Work DAG Analysis');
  lines.push('');
  lines.push(`Generated: ${now}  |  ${summaries.length} quests  |  ${edges.length} dependency edges`);
  lines.push('');

  // --- Topological Sort ---
  lines.push('## Topological Sort');
  lines.push('');
  lines.push('| # | Task ID | Title | Status | Campaign | Hours |');
  lines.push('|---|---------|-------|--------|----------|-------|');
  for (let i = 0; i < sorted.length; i++) {
    const id = sorted[i];
    if (!id) continue;
    const task = tasks.get(id);
    if (!task) continue;
    const campaign = task.campaignTitle ?? task.campaign?.replace(/^(campaign|milestone):/, '') ?? '—';
    lines.push(`| ${i + 1} | \`${id}\` | ${task.title} | ${task.status} | ${campaign} | ${task.hours} |`);
  }
  lines.push('');

  // --- Critical Path ---
  const cp = computeCriticalPath(sorted, summaries, edges);
  lines.push('## Critical Path Analysis');
  lines.push('');
  if (cp.path.length > 0) {
    lines.push(`**Total hours:** ${cp.totalHours}  |  **Length:** ${cp.path.length} tasks`);
    lines.push('');
    lines.push('```');
    lines.push(cp.path.map((id) => {
      const task = tasks.get(id);
      const h = task?.hours ?? 0;
      return `${id} (${h}h)`;
    }).join(' → '));
    lines.push('```');
    lines.push('');

    // Bottleneck: the critical path task with most hours
    const firstPathNode = cp.path[0];
    if (firstPathNode) {
      const bottleneck = cp.path.reduce((max, id) => {
        const t = tasks.get(id);
        const h = t?.hours ?? 0;
        const maxH = tasks.get(max)?.hours ?? 0;
        return h > maxH ? id : max;
      }, firstPathNode);
      const btTask = tasks.get(bottleneck);
      if (btTask) {
        lines.push(`**Bottleneck:** \`${bottleneck}\` — ${btTask.title} (${btTask.hours}h)`);
        lines.push('');
      }
    }
  } else {
    lines.push('No critical path (no dependencies or all tasks DONE).');
    lines.push('');
  }

  // --- Parallelism and Leveling ---
  const levels = computeLevels(sorted, edges);
  const width = dagWidth(levels);
  lines.push('## Parallelism and Leveling');
  lines.push('');
  lines.push('### Width of DAG');
  lines.push('');
  lines.push(`**Max parallelism:** ${width.width} tasks at level ${width.widestLevel}`);
  lines.push('');

  // Level histogram
  const levelGroups = new Map<number, string[]>();
  for (const [id, level] of levels) {
    const arr = levelGroups.get(level) ?? [];
    arr.push(id);
    levelGroups.set(level, arr);
  }
  const sortedLevelKeys = [...levelGroups.keys()].sort((a, b) => a - b);
  lines.push('| Level | Count | Tasks |');
  lines.push('|-------|-------|-------|');
  for (const level of sortedLevelKeys) {
    const ids = levelGroups.get(level) ?? [];
    const display = ids.map((id) => `\`${id.replace('task:', '')}\``).join(', ');
    lines.push(`| ${level} | ${ids.length} | ${display} |`);
  }
  lines.push('');

  // Scheduling
  lines.push(`### Scheduling (${WORKERS} workers)`);
  lines.push('');
  const schedule = scheduleWorkers(sorted, summaries, edges, WORKERS);
  lines.push(`**Makespan:** ${schedule.makespan}h`);
  const serialTotal = summaries.reduce((sum, t) => sum + (t.status === 'DONE' ? 0 : t.hours), 0);
  const utilization = schedule.makespan > 0
    ? ((serialTotal / (schedule.makespan * WORKERS)) * 100).toFixed(1)
    : '0.0';
  lines.push(`**Serial total:** ${serialTotal}h  |  **Utilization:** ${utilization}%`);
  lines.push('');

  for (const worker of schedule.schedule) {
    lines.push(`**Worker ${worker.workerId}:**`);
    for (const slot of worker.tasks) {
      const task = tasks.get(slot.id);
      const title = task?.title ?? slot.id;
      lines.push(`  - \`${slot.id}\` [${slot.start}h–${slot.start + slot.hours}h] ${title}`);
    }
    lines.push('');
  }

  // --- Transitive Reduction / Closure ---
  lines.push('## Transitive Reduction and Closure');
  lines.push('');

  const reduced = transitiveReduction(edges);
  const redundantCount = edges.length - reduced.length;
  lines.push('### Transitive Reduction');
  lines.push('');
  lines.push(`**Redundant edges:** ${redundantCount} of ${edges.length}`);
  lines.push('');
  if (redundantCount > 0) {
    const reducedSet = new Set(reduced.map((e) => `${e.from}→${e.to}`));
    const removedEdges = edges.filter((e) => !reducedSet.has(`${e.from}→${e.to}`));
    for (const e of removedEdges) {
      lines.push(`- \`${e.from}\` → \`${e.to}\` (redundant)`);
    }
    lines.push('');
  }

  const closure = transitiveClosure(edges);
  const impliedCount = closure.length - edges.length;
  lines.push('### Transitive Closure');
  lines.push('');
  lines.push(`**Implied dependencies:** ${impliedCount}`);
  lines.push('');
  if (impliedCount > 0) {
    const originalSet = new Set(edges.map((e) => `${e.from}→${e.to}`));
    const impliedEdges = closure.filter((e) => !originalSet.has(`${e.from}→${e.to}`));
    const displayLimit = Math.min(impliedEdges.length, 20);
    for (let i = 0; i < displayLimit; i++) {
      const e = impliedEdges[i];
      if (!e) continue;
      lines.push(`- \`${e.from}\` → \`${e.to}\``);
    }
    if (impliedEdges.length > 20) {
      lines.push(`- ... and ${impliedEdges.length - 20} more`);
    }
    lines.push('');
  }

  // --- Ancestry and Impact ---
  lines.push('## Ancestry and Impact Analysis');
  lines.push('');

  lines.push('### Reverse Reachability (Top Blockers)');
  lines.push('');
  const topBlockers = computeTopBlockers(summaries, edges, 15);
  if (topBlockers.length > 0) {
    lines.push('| Task | Title | Direct | Transitive |');
    lines.push('|------|-------|--------|------------|');
    for (const b of topBlockers) {
      const task = tasks.get(b.id);
      const title = task?.title ?? b.id;
      lines.push(`| \`${b.id}\` | ${title} | ${b.directCount} | ${b.transitiveCount} |`);
    }
    lines.push('');
  } else {
    lines.push('No active blockers.');
    lines.push('');
  }

  lines.push('### Provenance');
  lines.push('');
  const { frontier } = computeFrontier(summaries, edges);
  const prov = computeProvenance(frontier, edges);
  if (prov.size > 0) {
    lines.push('| Frontier Task | Title | Root Ancestors |');
    lines.push('|---------------|-------|----------------|');
    for (const [id, roots] of prov) {
      const task = tasks.get(id);
      const title = task?.title ?? id;
      const rootStr = roots.map((r) => `\`${r}\``).join(', ');
      lines.push(`| \`${id}\` | ${title} | ${rootStr} |`);
    }
    lines.push('');
  } else {
    lines.push('No frontier tasks.');
    lines.push('');
  }

  // --- Logical Grouping ---
  lines.push('## Logical Grouping (Campaigns)');
  lines.push('');

  const campaignStats = new Map<string, { total: number; done: number; hours: number; deps: number }>();
  for (const [, task] of tasks) {
    const key = task.campaign ?? '(none)';
    const stats = campaignStats.get(key) ?? { total: 0, done: 0, hours: 0, deps: 0 };
    stats.total++;
    if (task.status === 'DONE') stats.done++;
    stats.hours += task.hours;
    stats.deps += task.deps.length;
    campaignStats.set(key, stats);
  }

  lines.push('| Campaign | Tasks | Done | % | Hours | Deps |');
  lines.push('|----------|-------|------|---|-------|------|');
  const sortedCampaigns = [...campaignStats.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [campaign, stats] of sortedCampaigns) {
    const pct = stats.total > 0 ? ((stats.done / stats.total) * 100).toFixed(0) : '0';
    const label = campaign === '(none)' ? 'Unassigned' : campaign.replace(/^(campaign|milestone):/, '');
    lines.push(`| ${label} | ${stats.total} | ${stats.done} | ${pct}% | ${stats.hours} | ${stats.deps} |`);
  }
  lines.push('');

  // --- Anti-chains ---
  lines.push('## Anti-chains (Parallel Waves)');
  lines.push('');
  const chains = computeAntiChains(sorted, edges, summaries);
  if (chains.length > 0) {
    lines.push('| Wave | Parallel Tasks | Count | Total Hours |');
    lines.push('|------|----------------|-------|-------------|');
    for (let i = 0; i < chains.length; i++) {
      const wave = chains[i];
      if (!wave) continue;
      const waveHours = wave.reduce((sum, id) => {
        const t = summaries.find((s) => s.id === id);
        return sum + (t?.hours ?? 0);
      }, 0);
      const display = wave.map((id) => `\`${id.replace('task:', '')}\``).join(', ');
      lines.push(`| ${i} | ${display} | ${wave.length} | ${waveHours} |`);
    }
    lines.push('');
  } else {
    lines.push('No active anti-chains (all tasks DONE or no tasks).');
    lines.push('');
  }

  // --- Status summary ---
  lines.push('## Status Summary');
  lines.push('');
  const statusCounts = new Map<string, number>();
  for (const [, task] of tasks) {
    statusCounts.set(task.status, (statusCounts.get(task.status) ?? 0) + 1);
  }
  lines.push('| Status | Count |');
  lines.push('|--------|-------|');
  for (const status of ['DONE', 'IN_PROGRESS', 'PLANNED', 'BACKLOG', 'GRAVEYARD']) {
    const count = statusCounts.get(status) ?? 0;
    if (count > 0) lines.push(`| ${status} | ${count} |`);
  }
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('Loading WARP graph...');
  const { tasks, campaigns, sorted } = await loadGraph();
  console.log(`Loaded ${tasks.size} tasks, ${campaigns.size} campaigns`);

  const { summaries, edges } = buildAnalysisInputs(tasks);

  // Compute highlights
  const { frontier } = computeFrontier(summaries, edges);
  const frontierSet = new Set(frontier);
  const cp = computeCriticalPath(sorted, summaries, edges);
  const criticalSet = new Set(cp.path);
  const topBlockers = computeTopBlockers(summaries, edges, 10);
  const blockerSet = new Set(topBlockers.map((b) => b.id));

  const baseOpts: Omit<DotOptions, 'rankdir'> = {
    highlightFrontier: frontierSet,
    highlightPath: criticalSet,
    highlightBlockers: blockerSet,
  };

  // Create output dirs
  mkdirSync(OUTPUT_DIR, { recursive: true });

  // 1. Full DAG
  console.log('\nGenerating full DAG...');
  generatePair(tasks, OUTPUT_DIR, 'all', { ...baseOpts, title: 'XYPH Work DAG — All Quests' });

  // 2. Per-campaign
  const campaignIds = new Set<string>();
  for (const [, task] of tasks) {
    if (task.campaign) campaignIds.add(task.campaign);
  }

  for (const campaignId of [...campaignIds].sort()) {
    const campaignName = campaigns.get(campaignId) ?? campaignId.replace(/^(campaign|milestone):/, '');
    const safeName = campaignId.replace(/^(campaign|milestone):/, '');
    const dir = join(OUTPUT_DIR, `${safeName}`);
    mkdirSync(dir, { recursive: true });

    console.log(`\nGenerating ${safeName}...`);
    generatePair(tasks, dir, safeName, {
      ...baseOpts,
      title: `XYPH — ${campaignName}`,
      filter: (t) => t.campaign === campaignId,
    });
  }

  // 3. Backlog view
  console.log('\nGenerating backlog...');
  generatePair(tasks, OUTPUT_DIR, 'backlog', {
    ...baseOpts,
    title: 'XYPH — Backlog / Planned',
    filter: (t) => t.status === 'BACKLOG' || t.status === 'PLANNED',
  });

  // 4. Graveyard view
  console.log('\nGenerating graveyard...');
  generatePair(tasks, OUTPUT_DIR, 'graveyard', {
    ...baseOpts,
    title: 'XYPH — Graveyard',
    filter: (t) => t.status === 'GRAVEYARD',
  });

  // 5. Analysis document
  console.log('\nGenerating work.md...');
  const workMd = generateWorkMd(tasks, summaries, edges, sorted);
  writeFileSync(join(OUTPUT_DIR, 'work.md'), workMd);
  console.log(`  MD: ${join(OUTPUT_DIR, 'work.md')}`);

  console.log('\nDone!');
}

main().catch((err) => {
  console.error(`[FATAL] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
