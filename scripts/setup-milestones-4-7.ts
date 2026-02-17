#!/usr/bin/env -S npx tsx
/**
 * Roadmap Setup: Milestones 4–7
 *
 * SOVEREIGNTY — Human intent as causal root
 * WEAVER      — Dependency graph + scheduling primitives
 * ORACLE      — Classify → Validate → Merge pipeline stages
 * FORGE       — Review → Emit → Apply with Guild Seals
 */

import WarpGraph, { GitGraphAdapter } from '@git-stunts/git-warp';
import type { PatchSession } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';
import chalk from 'chalk';

const WRITER_ID = process.env['XYPH_AGENT_ID'] ?? 'agent.james';

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
): Promise<void> {
  const patch = (await graph.createPatch()) as PatchSession;
  fn(patch);
  const sha = await patch.commit();
  console.log(chalk.green(`  [OK] ${label} → ${sha.slice(0, 12)}`));
}

interface Quest {
  id: string;
  title: string;
  hours: number;
}

interface Milestone {
  campaignId: string;
  title: string;
  quests: Quest[];
}

const milestones: Milestone[] = [
  {
    campaignId: 'campaign:SOVEREIGNTY',
    title: 'Milestone 4: Sovereignty',
    quests: [
      { id: 'task:SOV-001', title: 'intent: node type + xyph-actuator intent command', hours: 4 },
      { id: 'task:SOV-002', title: 'Constitutional enforcement — reject quests without intent ancestry', hours: 6 },
      { id: 'task:SOV-003', title: 'Approval gate node type (Article IV.2 — critical path / >5% scope)', hours: 8 },
      { id: 'task:SOV-004', title: 'Guild Seal cryptographic signing on scrolls', hours: 8 },
    ],
  },
  {
    campaignId: 'campaign:WEAVER',
    title: 'Milestone 5: Weaver',
    quests: [
      { id: 'task:WVR-001', title: 'depends-on / blocked-by edge types + actuator command', hours: 4 },
      { id: 'task:WVR-002', title: 'DAG cycle detection at ingest (hard reject per Constitution Art. II)', hours: 6 },
      { id: 'task:WVR-003', title: 'Frontier computation — ready set of tasks with no incomplete blockers', hours: 4 },
      { id: 'task:WVR-004', title: "Topological sort via Kahn's algorithm — executable lane ordering", hours: 6 },
      { id: 'task:WVR-005', title: 'Critical path calculation via Dijkstra (weighted by humanHours)', hours: 8 },
    ],
  },
  {
    campaignId: 'campaign:ORACLE',
    title: 'Milestone 6: Oracle',
    quests: [
      { id: 'task:ORC-001', title: 'CLASSIFY phase — intent classification + complexity/risk inference', hours: 12 },
      { id: 'task:ORC-002', title: 'Full MUST/SHOULD/COULD policy engine (VALIDATE phase)', hours: 10 },
      { id: 'task:ORC-003', title: 'MERGE phase — candidate vs. snapshot collision detection + merge ops', hours: 10 },
      { id: 'task:ORC-004', title: 'Anti-chain generation — MECE parallel lane partitioning (Greedy coloring)', hours: 8 },
    ],
  },
  {
    campaignId: 'campaign:FORGE',
    title: 'Milestone 7: Forge',
    quests: [
      { id: 'task:FRG-001', title: 'REVIEW phase — human-readable diff + approver resolution', hours: 8 },
      { id: 'task:FRG-002', title: 'EMIT phase — PlanPatchArtifact + RollbackPatch generation + signing', hours: 10 },
      { id: 'task:FRG-003', title: 'APPLY phase — optimistic concurrency check + atomic commit + audit receipt', hours: 12 },
      { id: 'task:FRG-004', title: 'Full pipeline integration test: INGEST → APPLY end-to-end', hours: 8 },
    ],
  },
];

async function main() {
  console.log(chalk.bold(`\nRoadmap Setup: Milestones 4–7  (writer: ${WRITER_ID})\n`));

  const graph = await openGraph();

  for (const { campaignId, title, quests } of milestones) {
    console.log(chalk.cyan(`── ${title} ──`));

    // One patch per campaign: campaign node + all its quests
    await commitPatch(graph, `${campaignId} + ${quests.length} quests`, patch => {
      patch
        .addNode(campaignId)
        .setProperty(campaignId, 'title', title)
        .setProperty(campaignId, 'status', 'BACKLOG')
        .setProperty(campaignId, 'type', 'campaign')
        .addEdge(campaignId, 'roadmap:ROOT', 'belongs-to');

      for (const { id, title: questTitle, hours } of quests) {
        patch
          .addNode(id)
          .setProperty(id, 'title', questTitle)
          .setProperty(id, 'status', 'BACKLOG')
          .setProperty(id, 'hours', hours)
          .setProperty(id, 'type', 'task')
          .addEdge(id, campaignId, 'belongs-to');
      }
    });
  }

  // Verify
  console.log(chalk.cyan('\n── Verification ──'));
  await graph.materialize();

  for (const { campaignId, title, quests } of milestones) {
    const props = await graph.getNodeProps(campaignId);
    const status = props?.get('status') ?? 'MISSING';
    console.log(`\n  ${chalk.bold(title)}`);
    console.log(`  ${campaignId}  [${status}]`);
    for (const { id, title: qt, hours } of quests) {
      const qp = await graph.getNodeProps(id);
      const qs = qp?.get('status') ?? 'MISSING';
      const icon = qs === 'BACKLOG' ? chalk.yellow('·') : qs === 'DONE' ? chalk.green('✓') : chalk.red('?');
      console.log(`    ${icon} ${id.padEnd(16)}  ${String(hours).padStart(2)}h  ${qt}`);
    }
  }

  console.log(chalk.bold.green('\nRoadmap extended. 4 campaigns, 18 quests registered.\n'));
}

main().catch(err => {
  console.error(chalk.red(`[FATAL] ${err instanceof Error ? err.message : String(err)}`));
  process.exit(1);
});
