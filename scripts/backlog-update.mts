#!/usr/bin/env -S npx tsx
/**
 * Backlog update script — run once as human.james.
 *
 * 1. Declares missing intents: intent:ORACLE, intent:FORGE, intent:DASHBOARD
 * 2. Creates campaign:DASHBOARD for TUI polish quests
 * 3. Wires authorized-by edges to fix 13 existing sovereignty violations
 * 4. Adds new backlog quests for bugs, jank, and cool ideas noticed during M5
 *
 * Run: XYPH_AGENT_ID=human.james npx tsx scripts/backlog-update.mts
 */
import WarpGraph, { GitGraphAdapter } from '@git-stunts/git-warp';
import type { PatchSession } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';
import chalk from 'chalk';

const agentId = process.env['XYPH_AGENT_ID'] ?? 'human.james';
const now = Date.now();

const plumbing = Plumbing.createDefault({ cwd: process.cwd() });
const persistence = new GitGraphAdapter({ plumbing });
const graph = await WarpGraph.open({
  persistence,
  graphName: 'xyph-roadmap',
  writerId: agentId,
  autoMaterialize: true,
});
await graph.syncCoverage();
await graph.materialize();

async function commit(label: string, fn: (patch: PatchSession) => void): Promise<void> {
  const patch = (await graph.createPatch()) as PatchSession;
  fn(patch);
  const sha = await patch.commit();
  await graph.materialize();
  console.log(chalk.green(`[OK] ${label}`) + chalk.dim(`  ${sha.slice(0, 12)}`));
}

// ─── 1. Declare missing intents ───────────────────────────────────────────────

await commit('intent:ORACLE declared', (p) => {
  p.addNode('intent:ORACLE')
   .setProperty('intent:ORACLE', 'type', 'intent')
   .setProperty('intent:ORACLE', 'title', 'Build ORACLE: intent classification, policy engine, and merge phase')
   .setProperty('intent:ORACLE', 'requested_by', 'human.james')
   .setProperty('intent:ORACLE', 'created_at', now);
});

await commit('intent:FORGE declared', (p) => {
  p.addNode('intent:FORGE')
   .setProperty('intent:FORGE', 'type', 'intent')
   .setProperty('intent:FORGE', 'title', 'Build FORGE: emit, apply, and end-to-end pipeline integration')
   .setProperty('intent:FORGE', 'requested_by', 'human.james')
   .setProperty('intent:FORGE', 'created_at', now);
});

await commit('intent:DASHBOARD declared', (p) => {
  p.addNode('intent:DASHBOARD')
   .setProperty('intent:DASHBOARD', 'type', 'intent')
   .setProperty('intent:DASHBOARD', 'title', 'Build the WARP Dashboard: interactive TUI for graph navigation, triage, and observability')
   .setProperty('intent:DASHBOARD', 'requested_by', 'human.james')
   .setProperty('intent:DASHBOARD', 'created_at', now);
});

// ─── 2. Create campaign:DASHBOARD ─────────────────────────────────────────────

await commit('campaign:DASHBOARD created', (p) => {
  p.addNode('campaign:DASHBOARD')
   .setProperty('campaign:DASHBOARD', 'type', 'campaign')
   .setProperty('campaign:DASHBOARD', 'title', 'Milestone 5: WARP Dashboard')
   .setProperty('campaign:DASHBOARD', 'status', 'IN_PROGRESS');
});

// ─── 3. Fix sovereignty violations — wire authorized-by edges ─────────────────

const weaverQuests = ['task:WVR-001','task:WVR-002','task:WVR-003','task:WVR-004','task:WVR-005','task:WVR-006'];
const oracleQuests = ['task:ORC-001','task:ORC-002','task:ORC-003','task:ORC-004'];
const forgeQuests  = ['task:FRG-001','task:FRG-002','task:FRG-003','task:FRG-004'];

await commit(`Wire authorized-by: ${weaverQuests.length} WEAVER quests → intent:WEAVER`, (p) => {
  for (const id of weaverQuests) p.addEdge(id, 'intent:WEAVER', 'authorized-by');
});

await commit(`Wire authorized-by: ${oracleQuests.length} ORACLE quests → intent:ORACLE`, (p) => {
  for (const id of oracleQuests) p.addEdge(id, 'intent:ORACLE', 'authorized-by');
});

await commit(`Wire authorized-by: ${forgeQuests.length} FORGE quests → intent:FORGE`, (p) => {
  for (const id of forgeQuests) p.addEdge(id, 'intent:FORGE', 'authorized-by');
});

// ─── 4. New backlog quests ─────────────────────────────────────────────────────

type QuestDef = { id: string; title: string; hours: number; campaign: string; intent: string };

const newQuests: QuestDef[] = [
  // Bugs / jank found during M5
  {
    id: 'task:DSH-001',
    title: 'Fix campaign nodes: type stored as "task" instead of "campaign" — silently dropped by WarpDashboardAdapter',
    hours: 2,
    campaign: 'campaign:DASHBOARD',
    intent: 'intent:DASHBOARD',
  },
  {
    id: 'task:DSH-002',
    title: 'Add xyph-actuator campaign command to create campaign nodes with correct type and metadata',
    hours: 3,
    campaign: 'campaign:DASHBOARD',
    intent: 'intent:DASHBOARD',
  },
  {
    id: 'task:DSH-003',
    title: 'Add xyph-actuator link-intent command to wire authorized-by edge on existing quests',
    hours: 2,
    campaign: 'campaign:DASHBOARD',
    intent: 'intent:DASHBOARD',
  },
  {
    id: 'task:DSH-004',
    title: 'Fix IngestService test: "should skip quests with titles shorter than 5 characters" (pre-existing failure)',
    hours: 1,
    campaign: 'campaign:DASHBOARD',
    intent: 'intent:DASHBOARD',
  },
  // Dashboard polish / cool ideas
  {
    id: 'task:DSH-005',
    title: 'Dashboard auto-refresh: toggle with R key, configurable interval (default 30s)',
    hours: 3,
    campaign: 'campaign:DASHBOARD',
    intent: 'intent:DASHBOARD',
  },
  {
    id: 'task:DSH-006',
    title: 'Show "last refreshed HH:MM:SS" timestamp in dashboard tab bar',
    hours: 1,
    campaign: 'campaign:DASHBOARD',
    intent: 'intent:DASHBOARD',
  },
  {
    id: 'task:DSH-007',
    title: 'RoadmapView: show per-campaign completion progress in header (e.g. "3/7 ✓")',
    hours: 2,
    campaign: 'campaign:DASHBOARD',
    intent: 'intent:DASHBOARD',
  },
  {
    id: 'task:DSH-008',
    title: 'RoadmapView: typeahead search/filter — type to filter quests by title or ID',
    hours: 4,
    campaign: 'campaign:DASHBOARD',
    intent: 'intent:DASHBOARD',
  },
  {
    id: 'task:DSH-009',
    title: 'Dashboard: g key toggles GRAVEYARD visibility across all views',
    hours: 2,
    campaign: 'campaign:DASHBOARD',
    intent: 'intent:DASHBOARD',
  },
  {
    id: 'task:DSH-010',
    title: 'Campaign status auto-computed from quest completion instead of stored as stale property',
    hours: 3,
    campaign: 'campaign:DASHBOARD',
    intent: 'intent:DASHBOARD',
  },
];

await commit(`Add ${newQuests.length} new backlog quests`, (p) => {
  for (const q of newQuests) {
    p.addNode(q.id)
     .setProperty(q.id, 'type', 'task')
     .setProperty(q.id, 'title', q.title)
     .setProperty(q.id, 'status', 'BACKLOG')
     .setProperty(q.id, 'hours', q.hours)
     .addEdge(q.id, q.campaign, 'belongs-to')
     .addEdge(q.id, q.intent, 'authorized-by');
  }
});

console.log(chalk.bold('\nDone! Summary:'));
console.log('  3 new intents declared (ORACLE, FORGE, DASHBOARD)');
console.log('  1 new campaign created (campaign:DASHBOARD)');
console.log('  13 sovereignty violations fixed (authorized-by edges wired)');
console.log(`  ${newQuests.length} new backlog quests added (DSH-001 – DSH-010)`);
