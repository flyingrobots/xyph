#!/usr/bin/env -S npx tsx
/**
 * Idempotent repair script: fix campaign types + wire authorized-by edges.
 *
 * Found by audit-orphans.ts — 24 issues across 69 nodes:
 *   1. All 7 campaign nodes have type="task" (should be "campaign")
 *   2. All 14 pre-sovereignty quests lack authorized-by → intent:SOVEREIGNTY
 *
 * Run as: npx tsx scripts/repair-orphans.ts
 */
import WarpGraph, { GitGraphAdapter } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';
import chalk from 'chalk';
import { createPatchSession } from '../src/infrastructure/helpers/createPatchSession.js';

const WRITER_ID = process.env['XYPH_AGENT_ID'] ?? 'human.james';

// ─── Patch 1: Campaign nodes with wrong type ────────────────────────────────
const CAMPAIGNS = [
  'campaign:BEDROCK',
  'campaign:HEARTBEAT',
  'campaign:TRIAGE',
  'campaign:SOVEREIGNTY',
  'campaign:WEAVER',
  'campaign:ORACLE',
  'campaign:FORGE',
];

// ─── Patch 2: Pre-sovereignty quests missing authorized-by edge ──────────────
const QUESTS_NEEDING_INTENT = [
  // Milestone 1: Bedrock
  'task:BDK-001',
  'task:BDK-002',
  'task:BDK-003',
  // Milestone 2: Heartbeat
  'task:HRB-001',
  'task:HRB-002',
  'task:HRB-003',
  'task:HRB-004',
  // Milestone 3: Triage
  'task:TRG-001',
  'task:TRG-002',
  'task:TRG-003',
  // Milestone 4: Sovereignty (self-bootstrapping — these quests established the intent system)
  'task:SOV-001',
  'task:SOV-002',
  'task:SOV-003',
  'task:SOV-004',
];

const INTENT_TARGET = 'intent:SOVEREIGNTY';

const plumbing = Plumbing.createDefault({ cwd: process.cwd() });
const persistence = new GitGraphAdapter({ plumbing });

// Campaign nodes were originally created by agent.james with Lamport ticks 21-32.
// PropSet LWW uses the patch-level lamport, so we must commit via agent.james
// to get a lamport tick > 44 (agent.james's current max). Using human.james
// would only produce lamport ~15, losing the LWW race.
const CAMPAIGN_WRITER = 'agent.james';

const graph = await WarpGraph.open({
  persistence,
  graphName: 'xyph-roadmap',
  writerId: CAMPAIGN_WRITER,
  autoMaterialize: true,
});
await graph.syncCoverage();
await graph.materialize();

console.log(chalk.bold(`\nRepair Orphans  (campaign writer: ${CAMPAIGN_WRITER}, edge writer: ${WRITER_ID})\n`));

// ─── Patch 1: Fix campaign types ─────────────────────────────────────────────
console.log(chalk.cyan('── Patch 1: Fix campaign node types ──\n'));

const campaignsToFix: string[] = [];
for (const id of CAMPAIGNS) {
  const props = await graph.getNodeProps(id);
  if (!props) {
    console.log(chalk.yellow(`  [SKIP] ${id} — node not found`));
    continue;
  }
  const currentType = props.get('type');
  if (currentType === 'campaign') {
    console.log(chalk.dim(`  [SKIP] ${id} — already type="campaign"`));
    continue;
  }
  campaignsToFix.push(id);
  console.log(chalk.cyan(`  [FIX]  ${id} — type="${String(currentType)}" → "campaign"`));
}

if (campaignsToFix.length > 0) {
  const patch = await createPatchSession(graph);
  for (const id of campaignsToFix) {
    patch.setProperty(id, 'type', 'campaign');
  }
  const sha = await patch.commit();
  console.log(chalk.green(`\n  [OK] ${campaignsToFix.length} campaign(s) fixed → patch ${sha}`));
} else {
  console.log(chalk.dim('\n  No campaign type fixes needed.'));
}

// ─── Patch 2: Wire authorized-by edges ───────────────────────────────────────
// Use WRITER_ID (human.james) for edge wiring — these are new edges, no LWW conflict
console.log(chalk.cyan('\n── Patch 2: Wire authorized-by edges → intent:SOVEREIGNTY ──\n'));

const edgeGraph = await WarpGraph.open({
  persistence,
  graphName: 'xyph-roadmap',
  writerId: WRITER_ID,
  autoMaterialize: true,
});
await edgeGraph.syncCoverage();
await edgeGraph.materialize();

const questsToWire: string[] = [];
for (const id of QUESTS_NEEDING_INTENT) {
  const props = await edgeGraph.getNodeProps(id);
  if (!props) {
    console.log(chalk.yellow(`  [SKIP] ${id} — node not found`));
    continue;
  }
  const outgoing = (await edgeGraph.neighbors(id, 'outgoing')) as Array<{ label: string; nodeId: string }>;
  const hasAuth = outgoing.some((e) => e.label === 'authorized-by');
  if (hasAuth) {
    console.log(chalk.dim(`  [SKIP] ${id} — already has authorized-by edge`));
    continue;
  }
  questsToWire.push(id);
  console.log(chalk.cyan(`  [WIRE] ${id} → ${INTENT_TARGET}`));
}

if (questsToWire.length > 0) {
  const patch = await createPatchSession(edgeGraph);
  for (const id of questsToWire) {
    patch.addEdge(id, INTENT_TARGET, 'authorized-by');
  }
  const sha = await patch.commit();
  console.log(chalk.green(`\n  [OK] ${questsToWire.length} quest(s) wired → patch ${sha}`));
} else {
  console.log(chalk.dim('\n  No authorized-by wiring needed.'));
}

// ─── No-ops (informational) ──────────────────────────────────────────────────
console.log(chalk.cyan('\n── No-ops ──\n'));
console.log(chalk.dim('  intent:SOVEREIGNTY orphan → resolved by Patch 2 (gains inbound authorized-by edges)'));
console.log(chalk.dim('  task:INBOX-TEST-002       → already GRAVEYARD (via graveyard-ghosts.mts)'));
console.log(chalk.dim('  roadmap:ROOT              → already GRAVEYARD (via graveyard-ghosts.mts)'));

// ─── Verification pass (fresh graph instance to avoid coverage cache) ────────
console.log(chalk.cyan('\n── Verification ──\n'));

const verifyGraph = await WarpGraph.open({
  persistence,
  graphName: 'xyph-roadmap',
  writerId: WRITER_ID,
  autoMaterialize: true,
});
await verifyGraph.syncCoverage();
await verifyGraph.materialize();

let verified = 0;
let failed = 0;

for (const id of CAMPAIGNS) {
  const props = await verifyGraph.getNodeProps(id);
  const type = props?.get('type');
  if (type === 'campaign') {
    console.log(chalk.green(`  ✓ ${id} type="campaign"`));
    verified++;
  } else {
    console.log(chalk.red(`  ✗ ${id} type="${String(type)}" (expected "campaign")`));
    failed++;
  }
}

for (const id of QUESTS_NEEDING_INTENT) {
  const props = await verifyGraph.getNodeProps(id);
  if (!props) {
    console.log(chalk.red(`  ✗ ${id} — node not found`));
    failed++;
    continue;
  }
  const outgoing = (await verifyGraph.neighbors(id, 'outgoing')) as Array<{ label: string; nodeId: string }>;
  const hasAuth = outgoing.some((e) => e.label === 'authorized-by');
  if (hasAuth) {
    console.log(chalk.green(`  ✓ ${id} has authorized-by edge`));
    verified++;
  } else {
    console.log(chalk.red(`  ✗ ${id} missing authorized-by edge`));
    failed++;
  }
}

if (failed > 0) {
  console.log(chalk.red(`\n[FAIL] ${failed} verification(s) failed.\n`));
  process.exit(1);
} else {
  console.log(chalk.bold.green(`\n[OK] All ${verified} nodes verified. Repair complete.\n`));
}
