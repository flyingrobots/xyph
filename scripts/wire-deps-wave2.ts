#!/usr/bin/env -S npx tsx
/**
 * Wave 2: Wire remaining dependency edges.
 *
 * The first wave established 26 edges but left 114 tasks in the frontier.
 * This script adds the intra-group sequencing that was missing.
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

// ── Convention: [from, to] = `from` depends on `to` (to is prerequisite) ──

const WAVE2_EDGES: Array<[string, string, string]> = [
  // ─── BX: HistoryPort is the shared infra for time-travel commands ───
  // BX-017 (HistoryPort) must exist before history/receipts/seek/diff/provenance
  ['task:BX-009',  'task:BX-017',  'history needs HistoryPort'],
  ['task:BX-011',  'task:BX-017',  'receipts needs HistoryPort'],
  ['task:BX-012',  'task:BX-017',  'seek needs HistoryPort'],
  ['task:BX-014',  'task:BX-017',  'diff needs HistoryPort'],
  ['task:BX-016',  'task:BX-017',  'provenance panel needs HistoryPort'],
  // BX-010 (TUI h key) needs the history command (BX-009) to exist first
  ['task:BX-010',  'task:BX-009',  'TUI h key wraps history command'],
  // BX-006 (sovereignty gate) needs BX-001 (binary entry point)
  ['task:BX-006',  'task:BX-001',  'sovereignty gate lives in binary'],
  // BX-007 (promote provenance fix) needs BX-001 (binary/packaging)
  ['task:BX-007',  'task:BX-001',  'promote fix needs actuator packaging'],
  // BX-013 (LIVE/PINNED mode) needs BJU-009 (graph.watch in TEA loop)
  ['task:BX-013',  'task:BJU-009', 'LIVE/PINNED needs watch wired'],
  // BX-015 (slice) is relatively standalone but needs the binary
  ['task:BX-015',  'task:BX-001',  'slice command needs binary'],

  // ─── OVR: Dashboard redesign (Phase 5) — sequential build-up ───
  // OVR-012 (rename overview→dashboard) is the foundation rename
  ['task:OVR-001', 'task:OVR-012', 'header needs rename done first'],
  // Then build sections sequentially
  ['task:OVR-002', 'task:OVR-001', 'in-progress section needs header'],
  ['task:OVR-003', 'task:OVR-002', 'campaign bars need in-progress done'],
  ['task:OVR-004', 'task:OVR-003', 'My Issues needs campaign bars'],
  // OVR-005 (switch default view) requires the redesign to be usable
  ['task:OVR-005', 'task:OVR-004', 'switch default after redesign done'],
  // Enhancement widgets depend on the core dashboard (OVR-005)
  ['task:OVR-006', 'task:OVR-005', 'alert bar needs dashboard live'],
  ['task:OVR-007', 'task:OVR-005', 'inbox pressure needs dashboard live'],
  ['task:OVR-008', 'task:OVR-005', 'dep blockers needs dashboard live'],
  ['task:OVR-009', 'task:OVR-005', 'writer activity needs dashboard live'],
  ['task:OVR-010', 'task:OVR-005', 'quick actions needs dashboard live'],
  ['task:OVR-011', 'task:OVR-005', 'campaign focus needs dashboard live'],

  // ─── LIN: Lineage view improvements (Phase 4) — sequential ───
  ['task:LIN-002', 'task:LIN-001', 'intent cards need description surfaced'],
  ['task:LIN-003', 'task:LIN-002', 'orphan sovereignty needs intent cards'],

  // ─── GRV: Graveyard view (Phase 8) — sequential ───
  ['task:GRV-002', 'task:GRV-001', 'reopen action needs graveyard view'],
  ['task:GRV-003', 'task:GRV-002', 'patterns section needs browse + reopen'],

  // ─── TRG: Triage engine (Phase 7) — sequential pipeline ───
  ['task:TRG-002', 'task:TRG-001', 'policy config needs promotion workflow'],
  ['task:TRG-003', 'task:TRG-002', 'TUI triage view needs policy config'],
  ['task:TRG-004', 'task:TRG-003', 'recommendation engine needs triage view'],
  ['task:TRG-005', 'task:TRG-004', 'report command needs recommendation engine'],

  // ─── VOC: Vocabulary rename (Phase 9) — sequential ───
  ['task:VOC-002', 'task:VOC-001', 'normalization layer needs rename done'],
  ['task:VOC-003', 'task:VOC-002', 'DAG insertion needs normalization layer'],

  // ─── AGT: Agent commands (M12) — service layer then commands ───
  // AGT-006 (service layer) depends on agent-briefing (command design)
  ['task:AGT-006', 'task:agent-briefing', 'service implements briefing command'],
  // Agent commands depend on AGT-006 (service layer)
  ['task:AGT-002', 'task:AGT-006', 'status command needs service layer'],
  ['task:AGT-004', 'task:AGT-006', 'act command needs service layer'],
  ['task:AGT-005', 'task:AGT-006', 'log command needs service layer'],
  // AGT-009 (comment) before AGT-010 (flag) — flag extends comment infra
  ['task:AGT-010', 'task:AGT-009', 'flag builds on comment infrastructure'],
  // AGT-011/012/013 need cli-api for --json structured output
  ['task:AGT-011', 'task:cli-api',  'submissions view needs --json output'],
  ['task:AGT-012', 'task:AGT-011', 'review command needs submissions view'],
  ['task:AGT-013', 'task:cli-api',  'submit command needs --json output'],
  // AGT-008 (enhanced inbox) needs cli-api
  ['task:AGT-008', 'task:cli-api',  'enhanced inbox needs --json output'],

  // ─── CLI: Additional command dependencies ───
  // cli-assign and cli-move need cli-show (inspect before modify)
  ['task:cli-assign',        'task:cli-show', 'assign needs entity inspection'],
  ['task:cli-move',          'task:cli-show', 'move needs entity inspection'],
  // Wizards need cli-show for entity lookup / selection
  ['task:cli-wizard-quest',  'task:cli-show', 'quest wizard needs entity lookup'],
  ['task:cli-wizard-review', 'task:cli-show', 'review wizard needs entity lookup'],
  ['task:cli-wizard-review', 'task:cli-api',  'review wizard needs --json output'],

  // ─── SUB: Submission CLI/infra tasks ───
  ['task:SUB-CLI-001', 'task:cli-api',  'submission diff needs --json output'],
  ['task:SUB-CLI-002', 'task:BX-017',   'submission timeline needs HistoryPort'],

  // ─── DSH: Dashboard tasks needing BJU-002 (bijou port) ───
  ['task:DSH-008', 'task:BJU-002', 'typeahead search needs bijou port done'],
  ['task:DSH-009', 'task:GRV-001', 'graveyard toggle needs graveyard view'],
  ['task:DSH-010', 'task:DSH-002', 'auto-status needs campaign command'],

  // ─── Cross-milestone: e2e smoke test needs bijou port ───
  ['task:e2e-dashboard-smoke', 'task:BJU-002', 'e2e smoke needs bijou port done'],
  // statusline health needs BJU-002
  ['task:statusline-graph-health', 'task:BJU-002', 'statusline needs bijou port done'],
];

async function main(): Promise<void> {
  console.log(chalk.bold(`\nDependency Wiring — Wave 2  (writer: ${WRITER_ID})\n`));

  const graph = await openGraph();

  // Verify all referenced nodes exist
  console.log(chalk.cyan('── Verifying nodes ──'));
  const allIds = new Set<string>();
  for (const [from, to] of WAVE2_EDGES) {
    allIds.add(from);
    allIds.add(to);
  }

  const missing: string[] = [];
  for (const id of allIds) {
    const exists = await graph.hasNode(id);
    if (!exists) {
      missing.push(id);
    }
  }
  if (missing.length > 0) {
    console.log(chalk.red(`  Missing nodes: ${missing.join(', ')}`));
    throw new Error(`${missing.length} node(s) not found — fix before wiring`);
  }
  console.log(chalk.green(`  All ${allIds.size} nodes verified`));

  // Cycle detection
  console.log(chalk.cyan('\n── Cycle detection ──'));
  const skipped: string[] = [];
  const safe: Array<[string, string]> = [];

  for (const [from, to, reason] of WAVE2_EDGES) {
    const { reachable } = await graph.traverse.isReachable(to, from, {
      labelFilter: 'depends-on',
    });
    if (reachable) {
      console.log(chalk.yellow(`  [SKIP] ${from} → ${to}: would create cycle (${reason})`));
      skipped.push(`${from} → ${to}`);
    } else {
      safe.push([from, to]);
    }
  }

  if (skipped.length > 0) {
    console.log(chalk.yellow(`\n  Skipped ${skipped.length} edge(s) to avoid cycles`));
  }

  // Commit safe edges
  console.log(chalk.cyan(`\n── Committing ${safe.length} edges ──`));
  await commitPatch(graph, `${safe.length} depends-on edges (wave 2)`, (p) => {
    for (const [from, to] of safe) {
      p.addEdge(from, to, 'depends-on');
    }
  });

  await graph.materialize();

  // Count frontier
  const nodes = await graph.getNodes();
  const tasks = nodes.filter((n) => n.startsWith('task:'));
  let readyCount = 0;
  let blockedCount = 0;
  for (const taskId of tasks) {
    const props = await graph.getNodeProps(taskId);
    const status = props?.get('status') as string | undefined;
    if (status === 'DONE') continue;

    const neighbors = (await graph.neighbors(taskId, 'outgoing')) as Array<{
      label: string;
      nodeId: string;
    }>;
    const deps = neighbors.filter((n) => n.label === 'depends-on');
    let blocked = false;
    for (const dep of deps) {
      const depProps = await graph.getNodeProps(dep.nodeId);
      const depStatus = depProps?.get('status') as string | undefined;
      if (depStatus !== 'DONE') {
        blocked = true;
        break;
      }
    }
    if (blocked) {
      blockedCount++;
    } else {
      readyCount++;
    }
  }

  console.log(chalk.bold.green(`\nWave 2 complete.`));
  console.log(`  ${safe.length} edges added, ${skipped.length} skipped`);
  console.log(`  Frontier: ${readyCount} ready, ${blockedCount} blocked`);
}

main().catch((err) => {
  console.error(chalk.red(`[FATAL] ${err instanceof Error ? err.message : String(err)}`));
  process.exit(1);
});
