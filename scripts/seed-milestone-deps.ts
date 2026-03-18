#!/usr/bin/env -S npx tsx
/**
 * Seed milestone descriptions and dependency edges into the WARP graph.
 *
 * Idempotent — safe to run multiple times. Creates missing campaign nodes,
 * fixes incorrect statuses, sets description properties, and adds
 * depends-on edges between campaigns.
 */

import WarpGraph, { GitGraphAdapter } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';
import chalk from 'chalk';
import { createPatchSession } from '../src/infrastructure/helpers/createPatchSession.js';
import { toNeighborEntries } from '../src/infrastructure/helpers/isNeighborEntry.js';
import { resolveGraphRuntime } from '../src/cli/runtimeGraph.js';

const WRITER_ID = process.env['XYPH_AGENT_ID'] ?? 'agent.prime';
const runtime = resolveGraphRuntime({ cwd: process.cwd() });
const plumbing = Plumbing.createDefault({ cwd: runtime.repoPath });
const persistence = new GitGraphAdapter({ plumbing });

async function openGraph(): Promise<WarpGraph> {
  const graph = await WarpGraph.open({
    persistence,
    graphName: runtime.graphName,
    writerId: WRITER_ID,
    autoMaterialize: true,
  });
  await graph.syncCoverage();
  await graph.materialize();
  return graph;
}

// ---------------------------------------------------------------------------
// Campaign data
// ---------------------------------------------------------------------------

interface CampaignSeed {
  id: string;
  title: string;
  status: string;
  description: string;
}

const CAMPAIGNS: CampaignSeed[] = [
  {
    id: 'campaign:BEDROCK',
    title: 'Milestone 1: Bedrock Foundations',
    status: 'DONE',
    description: 'Bootstrapped the project: docs, repo, actuator, WARP graph.',
  },
  {
    id: 'campaign:HEARTBEAT',
    title: 'Milestone 2: The Heartbeat',
    status: 'DONE',
    description: 'Coordinator service, ingest pipeline, normalize phase, orchestration FSM.',
  },
  {
    id: 'campaign:TRIAGE',
    title: 'Milestone 3: Triage',
    status: 'DONE',
    description: 'Triage service, origin context, backlog rebalancer.',
  },
  {
    id: 'campaign:SOVEREIGNTY',
    title: 'Milestone 4: Sovereignty',
    status: 'DONE',
    description: 'Intents, constitutional enforcement, approval gates, Guild Seals.',
  },
  {
    id: 'campaign:DASHBOARD',
    title: 'Milestone 5: WARP Dashboard',
    status: 'DONE',
    description: 'Fullscreen TUI, alternate screen, flicker-free rendering, status line, log gutter.',
  },
  {
    id: 'campaign:SUBMISSION',
    title: 'Milestone 6: Submission & Review Workflow',
    status: 'DONE',
    description: 'Submit, revise, review, merge, close — all graph-native.',
  },
  {
    id: 'campaign:WEAVER',
    title: 'Milestone 7: Weaver',
    status: 'DONE',
    description: 'Task dependency graph, cycle detection, frontier computation, topological sort, critical path.',
  },
  {
    id: 'campaign:ORACLE',
    title: 'Milestone 8: Oracle',
    status: 'BACKLOG',
    description: 'Intent classification, MUST/SHOULD/COULD policy engine, merge conflict detection, anti-chain generation.',
  },
  {
    id: 'campaign:FORGE',
    title: 'Milestone 9: Forge',
    status: 'BACKLOG',
    description: 'REVIEW phase, EMIT phase (PlanPatchArtifact), APPLY phase (optimistic concurrency), full pipeline integration.',
  },
  {
    id: 'campaign:CLITOOL',
    title: 'Milestone 10: CLI Tooling',
    status: 'IN_PROGRESS',
    description: 'Identity resolution, xyph whoami, xyph login/logout, --json output, interactive wizards, missing commands.',
  },
  {
    id: 'campaign:TRACE',
    title: 'Milestone 11: Traceability',
    status: 'BACKLOG',
    description: 'Stories, requirements, acceptance criteria, evidence, computed completion.',
  },
  {
    id: 'campaign:AGENT',
    title: 'Milestone 12: Agent Protocol',
    status: 'BACKLOG',
    description: 'Structured agent interface: briefing, next, context, handoff.',
  },
  {
    id: 'campaign:ECOSYSTEM',
    title: 'Ecosystem',
    status: 'BACKLOG',
    description: 'MCP server, Web UI, IDE integration, graph export/import.',
  },
];

// [from, to] — from depends-on to
const DEP_EDGES: [string, string][] = [
  ['campaign:CLITOOL', 'campaign:WEAVER'],
  ['campaign:AGENT', 'campaign:CLITOOL'],
  ['campaign:TRACE', 'campaign:WEAVER'],
  ['campaign:ORACLE', 'campaign:WEAVER'],
  ['campaign:ORACLE', 'campaign:TRACE'],
  ['campaign:FORGE', 'campaign:ORACLE'],
  ['campaign:FORGE', 'campaign:WEAVER'],
  ['campaign:ECOSYSTEM', 'campaign:CLITOOL'],
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(chalk.bold(`\nSeed Milestone Data  (writer: ${WRITER_ID})\n`));

  const graph = await openGraph();

  // ── Pass 1: Create missing nodes, fix statuses, set descriptions ──
  console.log(chalk.cyan('── Seeding campaign nodes ──'));
  const patch = await createPatchSession(graph);
  let created = 0;
  let updated = 0;

  for (const c of CAMPAIGNS) {
    const exists = await graph.hasNode(c.id);

    if (!exists) {
      patch.addNode(c.id);
      patch.setProperty(c.id, 'type', 'campaign');
      patch.setProperty(c.id, 'title', c.title);
      patch.setProperty(c.id, 'status', c.status);
      patch.setProperty(c.id, 'description', c.description);
      console.log(chalk.green(`  [CREATE] ${c.id} — ${c.title}`));
      created++;
    } else {
      // Update description (always — idempotent)
      const props = await graph.getNodeProps(c.id);
      const currentDesc = props?.['description'];
      const currentStatus = props?.['status'];

      if (currentDesc !== c.description) {
        patch.setProperty(c.id, 'description', c.description);
        console.log(chalk.yellow(`  [UPDATE] ${c.id} description`));
        updated++;
      }

      if (currentStatus !== c.status) {
        patch.setProperty(c.id, 'status', c.status);
        console.log(chalk.yellow(`  [UPDATE] ${c.id} status: ${String(currentStatus)} → ${c.status}`));
        updated++;
      }
    }
  }

  // ── Pass 2: Add dependency edges ──
  console.log(chalk.cyan('\n── Wiring dependency edges ──'));
  let edgesAdded = 0;
  let edgesSkipped = 0;

  for (const [from, to] of DEP_EDGES) {
    // Check if edge already exists
    const neighbors = toNeighborEntries(await graph.neighbors(from, 'outgoing'));
    const alreadyExists = neighbors.some(
      (n) => n.label === 'depends-on' && n.nodeId === to,
    );

    if (alreadyExists) {
      console.log(chalk.gray(`  [SKIP] ${from} → ${to} (already exists)`));
      edgesSkipped++;
      continue;
    }

    // Cycle check
    const { reachable } = await graph.traverse.isReachable(to, from, {
      labelFilter: 'depends-on',
    });
    if (reachable) {
      console.log(chalk.red(`  [SKIP] ${from} → ${to} (would create cycle)`));
      edgesSkipped++;
      continue;
    }

    patch.addEdge(from, to, 'depends-on');
    console.log(chalk.green(`  [ADD] ${from} → ${to}`));
    edgesAdded++;
  }

  // ── Commit ──
  const sha = await patch.commit();
  await graph.materialize();

  console.log(chalk.bold.green(`\nSeed complete.`));
  console.log(`  ${created} nodes created, ${updated} properties updated`);
  console.log(`  ${edgesAdded} edges added, ${edgesSkipped} skipped`);
  console.log(`  Patch SHA: ${sha.slice(0, 12)}`);
}

main().catch((err) => {
  console.error(chalk.red(`[FATAL] ${err instanceof Error ? err.message : String(err)}`));
  process.exit(1);
});
