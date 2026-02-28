#!/usr/bin/env -S npx tsx
/**
 * Reconcile Backlog: campaign creation, linkage, and dependency wiring.
 *
 * Steps:
 *   1. Create campaign:AGENT (M12)
 *   2. Link orphan tasks to campaigns (belongs-to) and intents (authorized-by)
 *   3. Wire ~30 dependency edges (depends-on)
 */

import WarpGraph, { GitGraphAdapter, PatchSession } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';
import chalk from 'chalk';
import { createPatchSession } from '../src/infrastructure/helpers/createPatchSession.js';

const WRITER_ID = process.env['XYPH_AGENT_ID'] ?? 'agent.prime';

const plumbing = Plumbing.createDefault({ cwd: process.cwd() });
const persistence = new GitGraphAdapter({ plumbing });

async function openGraph(): Promise<WarpGraph> {
  const graph = await WarpGraph.open({
    persistence,
    graphName: 'xyph-roadmap',
    writerId: WRITER_ID,
    autoMaterialize: true,
  });
  await graph.syncCoverage();
  await graph.materialize();
  return graph;
}

async function commitPatch(
  graph: WarpGraph,
  label: string,
  fn: (patch: PatchSession) => void,
): Promise<string> {
  const patch = await createPatchSession(graph);
  fn(patch);
  const sha = await patch.commit();
  console.log(chalk.green(`  [OK] ${label} → ${sha.slice(0, 12)}`));
  return sha;
}

// ── Step 1: Create campaign:AGENT (M12) ──

async function createAgentCampaign(graph: WarpGraph): Promise<void> {
  console.log(chalk.cyan('\n── Create campaign:AGENT (M12) ──'));

  const exists = await graph.hasNode('campaign:AGENT');
  if (exists) {
    console.log(chalk.yellow('  [SKIP] campaign:AGENT already exists'));
    return;
  }

  await commitPatch(graph, 'campaign:AGENT', (p) => {
    p.addNode('campaign:AGENT')
      .setProperty('campaign:AGENT', 'title', 'Milestone 12: Agent Protocol')
      .setProperty('campaign:AGENT', 'status', 'BACKLOG')
      .setProperty('campaign:AGENT', 'type', 'campaign')
      .addEdge('campaign:AGENT', 'roadmap:ROOT', 'belongs-to');
  });
}

// ── Step 2: Link tasks to campaigns + intents ──

interface LinkSpec {
  taskId: string;
  campaignId: string;
  intentId: string;
}

const CAMPAIGN_LINKS: LinkSpec[] = [
  // M10 CLI Tooling — intent:CLI-FOUNDATION
  { taskId: 'task:cli-show', campaignId: 'campaign:CLITOOL', intentId: 'intent:CLI-FOUNDATION' },
  { taskId: 'task:cli-api', campaignId: 'campaign:CLITOOL', intentId: 'intent:CLI-FOUNDATION' },
  { taskId: 'task:cli-assign', campaignId: 'campaign:CLITOOL', intentId: 'intent:CLI-FOUNDATION' },
  { taskId: 'task:cli-move', campaignId: 'campaign:CLITOOL', intentId: 'intent:CLI-FOUNDATION' },
  { taskId: 'task:cli-plan', campaignId: 'campaign:CLITOOL', intentId: 'intent:CLI-FOUNDATION' },
  { taskId: 'task:cli-diff', campaignId: 'campaign:CLITOOL', intentId: 'intent:CLI-FOUNDATION' },
  { taskId: 'task:cli-batch', campaignId: 'campaign:CLITOOL', intentId: 'intent:CLI-FOUNDATION' },
  { taskId: 'task:cli-wizard-quest', campaignId: 'campaign:CLITOOL', intentId: 'intent:CLI-FOUNDATION' },
  { taskId: 'task:cli-wizard-review', campaignId: 'campaign:CLITOOL', intentId: 'intent:CLI-FOUNDATION' },
  { taskId: 'task:cli-wizard-promote', campaignId: 'campaign:CLITOOL', intentId: 'intent:CLI-FOUNDATION' },
  { taskId: 'task:cli-wizard-triage', campaignId: 'campaign:CLITOOL', intentId: 'intent:CLI-FOUNDATION' },
  { taskId: 'task:cli-fuzzy-claim', campaignId: 'campaign:CLITOOL', intentId: 'intent:CLI-FOUNDATION' },

  // M12 Agent Protocol — intent:AGENT-PROTOCOL
  { taskId: 'task:agent-briefing', campaignId: 'campaign:AGENT', intentId: 'intent:AGENT-PROTOCOL' },
  { taskId: 'task:agent-next', campaignId: 'campaign:AGENT', intentId: 'intent:AGENT-PROTOCOL' },
  { taskId: 'task:agent-context', campaignId: 'campaign:AGENT', intentId: 'intent:AGENT-PROTOCOL' },
  { taskId: 'task:agent-handoff', campaignId: 'campaign:AGENT', intentId: 'intent:AGENT-PROTOCOL' },

  // M5 Dashboard — intent:DASHBOARD
  { taskId: 'task:tui-toast-watch', campaignId: 'campaign:DASHBOARD', intentId: 'intent:DASHBOARD' },
  { taskId: 'task:tui-submission-stepper', campaignId: 'campaign:DASHBOARD', intentId: 'intent:DASHBOARD' },
  { taskId: 'task:tui-chord-commands', campaignId: 'campaign:DASHBOARD', intentId: 'intent:DASHBOARD' },
  { taskId: 'task:tui-quest-modal', campaignId: 'campaign:DASHBOARD', intentId: 'intent:DASHBOARD' },
  { taskId: 'task:dashboard-resize-handler', campaignId: 'campaign:DASHBOARD', intentId: 'intent:DASHBOARD' },
  { taskId: 'task:tui-min-size-guard', campaignId: 'campaign:DASHBOARD', intentId: 'intent:DASHBOARD' },
  { taskId: 'task:statusline-graph-health', campaignId: 'campaign:DASHBOARD', intentId: 'intent:DASHBOARD' },
  { taskId: 'task:help-modal-warp-glossary', campaignId: 'campaign:DASHBOARD', intentId: 'intent:DASHBOARD' },
  { taskId: 'task:doc-tui-plan-update', campaignId: 'campaign:DASHBOARD', intentId: 'intent:DASHBOARD' },
];

async function linkTasksToCampaigns(graph: WarpGraph): Promise<void> {
  console.log(chalk.cyan('\n── Link tasks to campaigns + intents ──'));

  // Verify all target nodes exist, collecting only valid specs
  const validLinks: LinkSpec[] = [];
  for (const { taskId, campaignId, intentId } of CAMPAIGN_LINKS) {
    const [taskExists, campaignExists, intentExists] = await Promise.all([
      graph.hasNode(taskId),
      graph.hasNode(campaignId),
      graph.hasNode(intentId),
    ]);
    if (!taskExists) {
      console.log(chalk.red(`  [ERR] Task ${taskId} not found — skipping`));
      continue;
    }
    if (!campaignExists) {
      throw new Error(`Campaign ${campaignId} not found — create it first`);
    }
    if (!intentExists) {
      throw new Error(`Intent ${intentId} not found — create it first`);
    }
    validLinks.push({ taskId, campaignId, intentId });
  }

  // Batch by campaign for cleaner patches
  const byCampaign = new Map<string, LinkSpec[]>();
  for (const spec of validLinks) {
    const arr = byCampaign.get(spec.campaignId) ?? [];
    arr.push(spec);
    byCampaign.set(spec.campaignId, arr);
  }

  for (const [campaignId, specs] of byCampaign) {
    const ids = specs.map((s) => s.taskId.replace('task:', '')).join(', ');
    await commitPatch(graph, `${campaignId} ← [${ids}]`, (p) => {
      for (const { taskId, campaignId: cId, intentId } of specs) {
        p.addEdge(taskId, cId, 'belongs-to')
          .addEdge(taskId, intentId, 'authorized-by');
      }
    });
    await graph.materialize();
  }
}

// ── Step 3: Wire dependency edges ──

// Convention: [from, to] means `from` depends on `to` (to is the prerequisite)
const DEPENDENCY_EDGES: Array<[string, string]> = [
  // M10 CLI Tooling: BX-001 is prerequisite for BX-002, etc.
  ['task:BX-002', 'task:BX-001'],
  ['task:BX-003', 'task:BX-002'],
  ['task:BX-004', 'task:BX-003'],
  ['task:BX-005', 'task:BX-001'],
  ['task:BX-008', 'task:BX-001'],
  ['task:cli-plan', 'task:cli-show'],
  ['task:cli-fuzzy-claim', 'task:cli-show'],
  ['task:cli-diff', 'task:cli-api'],
  ['task:cli-batch', 'task:cli-api'],
  ['task:cli-wizard-triage', 'task:cli-wizard-promote'],

  // M12 Agent Protocol: cli-api is prerequisite for agent commands
  ['task:agent-briefing', 'task:cli-api'],
  ['task:agent-next', 'task:cli-api'],
  ['task:agent-handoff', 'task:cli-api'],
  ['task:agent-context', 'task:cli-api'],
  ['task:agent-context', 'task:cli-show'],

  // M5 Dashboard
  ['task:BJU-009', 'task:BJU-002'],
  // BJU-010 → BJU-009 already exists — skip
  ['task:tui-toast-watch', 'task:BJU-009'],
  ['task:DSH-001', 'task:DSH-002'],
  ['task:DSH-003', 'task:DSH-002'],
  ['task:tui-quest-modal', 'task:tui-chord-commands'],

  // M8 Oracle (sequential pipeline)
  ['task:ORC-002', 'task:ORC-001'],
  ['task:ORC-003', 'task:ORC-002'],
  ['task:ORC-004', 'task:ORC-003'],

  // M9 Forge (sequential pipeline)
  ['task:FRG-002', 'task:FRG-001'],
  ['task:FRG-003', 'task:FRG-002'],
  ['task:FRG-004', 'task:FRG-003'],
];

async function wireDependencies(graph: WarpGraph): Promise<void> {
  console.log(chalk.cyan('\n── Wire dependency edges ──'));

  // Verify all nodes exist
  const allIds = new Set<string>();
  for (const [from, to] of DEPENDENCY_EDGES) {
    allIds.add(from);
    allIds.add(to);
  }

  for (const id of allIds) {
    const exists = await graph.hasNode(id);
    if (!exists) {
      throw new Error(`[NOT_FOUND] Node ${id} does not exist`);
    }
  }

  // Cycle detection: check each edge won't create a cycle
  const safe: Array<[string, string]> = [];
  for (const [from, to] of DEPENDENCY_EDGES) {
    const { reachable } = await graph.traverse.isReachable(to, from, {
      labelFilter: 'depends-on',
    });
    if (reachable) {
      console.log(chalk.red(`  [CYCLE] ${from} → ${to} would create a cycle — skipping`));
    } else {
      safe.push([from, to]);
    }
  }

  // Batch safe dependency edges into one patch
  await commitPatch(
    graph,
    `${safe.length} depends-on edges`,
    (p) => {
      for (const [from, to] of safe) {
        p.addEdge(from, to, 'depends-on');
      }
    },
  );
}

// ── Main ──

async function main(): Promise<void> {
  console.log(chalk.bold(`\nBacklog Reconciliation  (writer: ${WRITER_ID})\n`));

  const graph = await openGraph();

  await createAgentCampaign(graph);
  await graph.materialize();

  await linkTasksToCampaigns(graph);
  await graph.materialize();

  await wireDependencies(graph);
  await graph.materialize();

  // Summary
  const nodes = await graph.getNodes();
  const tasks = nodes.filter((n) => n.startsWith('task:'));
  const campaigns = nodes.filter((n) => n.startsWith('campaign:'));
  const intents = nodes.filter((n) => n.startsWith('intent:'));

  console.log(chalk.bold.green(`\nReconciliation complete.`));
  console.log(`  ${campaigns.length} campaigns, ${intents.length} intents, ${tasks.length} tasks`);
}

main().catch((err) => {
  console.error(chalk.red(`[FATAL] ${err instanceof Error ? err.message : String(err)}`));
  process.exit(1);
});
