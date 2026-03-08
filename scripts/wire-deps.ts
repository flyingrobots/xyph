#!/usr/bin/env -S npx tsx
/**
 * Wire dependency edges into the WARP roadmap graph.
 *
 * Consolidated from wave2 + wave3 + fixup scripts. Idempotent — safe to
 * re-run; existing edges are harmless OR-set duplicates and the cycle
 * detector will skip them.
 *
 * Convention: [from, to, reason] — `from` depends on `to` (to is prerequisite).
 */

import WarpGraph, { GitGraphAdapter } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';
import chalk from 'chalk';
import { createPatchSession } from '../src/infrastructure/helpers/createPatchSession.js';
import { toNeighborEntries } from '../src/infrastructure/helpers/isNeighborEntry.js';

const WRITER_ID = process.env['XYPH_AGENT_ID'] ?? 'agent.prime';
const plumbing = Plumbing.createDefault({ cwd: process.cwd() });
const persistence = new GitGraphAdapter({ plumbing });

// ── All dependency edges ──────────────────────────────────────────────────

const EDGES: [string, string, string][] = [
  // ─── BX: CLI Tooling (M10) ───
  // BX-010 (TUI h key) needs the history command (BX-009)
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
  ['task:OVR-001', 'task:OVR-012', 'header needs rename done first'],
  ['task:OVR-002', 'task:OVR-001', 'in-progress section needs header'],
  ['task:OVR-003', 'task:OVR-002', 'campaign bars need in-progress done'],
  ['task:OVR-004', 'task:OVR-003', 'My Issues needs campaign bars'],
  ['task:OVR-005', 'task:OVR-004', 'switch default after redesign done'],
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

  // ─── VOC: Vocabulary rename (Phase 9) ───
  // VOC-002 graveyarded (normalization already done); VOC-003 depends on VOC-002
  ['task:VOC-003', 'task:VOC-001', 'DAG insertion needs rename done'],

  // ─── AGT: Agent commands (M12) — service layer then commands ───
  ['task:AGT-002', 'task:AGT-006', 'status command needs service layer'],
  ['task:AGT-004', 'task:AGT-006', 'act command needs service layer'],
  ['task:AGT-005', 'task:AGT-006', 'log command needs service layer'],
  ['task:AGT-010', 'task:AGT-009', 'flag builds on comment infrastructure'],
  ['task:AGT-011', 'task:cli-api',  'submissions view needs --json output'],
  ['task:AGT-012', 'task:AGT-011', 'review command needs submissions view'],
  ['task:AGT-013', 'task:cli-api',  'submit command needs --json output'],
  ['task:AGT-008', 'task:cli-api',  'enhanced inbox needs --json output'],

  // ─── CLI: Additional command dependencies ───
  ['task:cli-assign',        'task:cli-show', 'assign needs entity inspection'],
  ['task:cli-move',          'task:cli-show', 'move needs entity inspection'],

  // ─── SUB: Submission CLI/infra tasks ───
  ['task:SUB-CLI-001', 'task:cli-api',  'submission diff needs --json output'],

  // ─── DSH: Dashboard tasks ───
  ['task:DSH-008', 'task:BJU-002', 'typeahead search needs bijou port done'],
  ['task:DSH-009', 'task:GRV-001', 'graveyard toggle needs graveyard view'],
  ['task:DSH-010', 'task:DSH-002', 'auto-status needs campaign command'],
  // e2e-dashboard-smoke graveyarded (Ink removed)
  ['task:statusline-graph-health', 'task:BJU-002', 'statusline needs bijou port done'],

  // ─── Wave 3: cross-milestone dependencies ───
  ['task:dag-visualization', 'task:bijou-dag-renderer', 'dag viz uses bijou dag component'],
  ['task:theme-preview-command', 'task:theme-shared-module', 'preview uses shared theme module'],
  ['task:warp-explorer-view', 'task:BJU-002', 'explorer view built on bijou TUI'],
  ['task:no-tui-mode', 'task:BX-001', 'headless mode is a flag on the binary'],
  ['task:mcp-server', 'task:cli-api', 'MCP server wraps CLI API layer'],
  ['task:multi-user-proof', 'task:BX-002', 'multi-user needs identity resolution'],
  ['task:web-ui', 'task:cli-api', 'web UI consumes JSON API'],
  ['task:dashboard-adapter-error-isolation', 'task:BJU-002', 'error isolation for bijou adapter'],
  ['task:dashboard-resize-handler', 'task:BJU-002', 'resize handler for bijou TUI'],
  ['task:snapshot-render-regression', 'task:BJU-002', 'snapshot tests need bijou views'],
  // inline-color-status graveyarded (already inlined)
  ['task:actuator-theme-destructure', 'task:theme-shared-module', 'destructure uses shared theme tokens'],
  ['task:tui-submission-stepper', 'task:BJU-002', 'stepper built with bijou components'],
  ['task:tui-min-size-guard', 'task:BJU-002', 'min size guard for bijou TUI'],
  ['task:tui-logger-unit-tests', 'task:BJU-002', 'logger tests need bijou port context'],
  ['task:git-hooks-lifecycle', 'task:BX-001', 'git hooks need packaged binary'],
  ['task:ide-integration', 'task:BX-001', 'IDE extension wraps binary'],
  ['task:ide-integration', 'task:cli-api', 'IDE extension uses JSON API'],
  ['task:graph-export-import', 'task:cli-api', 'export/import uses structured API'],
  ['task:help-modal-warp-glossary', 'task:BJU-002', 'help modal is bijou component'],
  ['task:pre-push-typecheck', 'task:coverage-threshold', 'push hook after coverage config'],
  ['task:lint-unused-interface-fields', 'task:coverage-threshold', 'lint rules after coverage config'],
  ['task:style-guide-md040', 'task:doc-tui-plan-update', 'style guide after plan docs updated'],
  ['task:DSH-002', 'task:SUB-SCHEMA-001', 'fix prefix collision before campaign command'],
];

async function main(): Promise<void> {
  console.log(chalk.bold(`\nDependency Wiring  (writer: ${WRITER_ID})\n`));

  const graph = await WarpGraph.open({
    persistence,
    graphName: 'xyph-roadmap',
    writerId: WRITER_ID,
    autoMaterialize: true,
  });
  await graph.syncCoverage();
  await graph.materialize();

  // ── Verify nodes ──
  console.log(chalk.cyan('── Verifying nodes ──'));
  const allIds = new Set<string>();
  for (const [from, to] of EDGES) {
    allIds.add(from);
    allIds.add(to);
  }

  const missing = new Set<string>();
  for (const id of allIds) {
    const exists = await graph.hasNode(id);
    if (!exists) missing.add(id);
  }

  if (missing.size > 0) {
    console.log(chalk.yellow(`  Missing nodes (will skip): ${[...missing].join(', ')}`));
  }
  console.log(chalk.green(`  ${allIds.size - missing.size}/${allIds.size} nodes verified`));

  // Filter to edges where both nodes exist
  const validEdges = EDGES.filter(
    ([from, to]) => !missing.has(from) && !missing.has(to),
  );

  // ── Duplicate detection ──
  console.log(chalk.cyan('\n── Duplicate detection ──'));
  let existingCount = 0;
  const newEdges: [string, string, string][] = [];

  for (const edge of validEdges) {
    const [from, to] = edge;
    const neighbors = toNeighborEntries(await graph.neighbors(from, 'outgoing'));
    const alreadyExists = neighbors.some((n) => n.label === 'depends-on' && n.nodeId === to);
    if (alreadyExists) {
      existingCount++;
    } else {
      newEdges.push(edge);
    }
  }

  if (existingCount > 0) {
    console.log(chalk.dim(`  ${existingCount} edge(s) already exist — skipping`));
  }

  if (newEdges.length === 0) {
    console.log(chalk.green('\n  All edges already wired. Nothing to do.'));
    return;
  }

  // ── Cycle detection ──
  console.log(chalk.cyan('\n── Cycle detection ──'));
  const safe: [string, string][] = [];
  let cycleCount = 0;

  for (const [from, to, reason] of newEdges) {
    const { reachable } = await graph.traverse.isReachable(to, from, {
      labelFilter: 'depends-on',
    });
    if (reachable) {
      console.log(chalk.yellow(`  [CYCLE] ${from} → ${to}: ${reason}`));
      cycleCount++;
    } else {
      safe.push([from, to]);
    }
  }

  // ── Commit ──
  console.log(chalk.cyan(`\n── Committing ${safe.length} edge(s) ──`));
  const patch = await createPatchSession(graph);
  for (const [from, to] of safe) {
    patch.addEdge(from, to, 'depends-on');
  }
  const sha = await patch.commit();
  console.log(chalk.green(`  [OK] ${safe.length} depends-on edges → ${sha.slice(0, 12)}`));

  await graph.materialize();

  // ── Frontier summary ──
  const nodes = await graph.getNodes();
  const tasks = nodes.filter((n) => n.startsWith('task:'));
  let readyCount = 0;
  let blockedCount = 0;
  let doneCount = 0;
  for (const taskId of tasks) {
    const props = await graph.getNodeProps(taskId);
    const status = props?.['status'] as string | undefined;
    if (status === 'DONE' || status === 'GRAVEYARD') { doneCount++; continue; }

    const neighbors = toNeighborEntries(await graph.neighbors(taskId, 'outgoing'));
    const deps = neighbors.filter((n) => n.label === 'depends-on');
    let blocked = false;
    for (const dep of deps) {
      const depProps = await graph.getNodeProps(dep.nodeId);
      const depStatus = depProps?.['status'] as string | undefined;
      if (depStatus !== 'DONE' && depStatus !== 'GRAVEYARD') {
        blocked = true;
        break;
      }
    }
    if (blocked) blockedCount++;
    else readyCount++;
  }

  console.log(chalk.bold.green('\nWiring complete.'));
  console.log(`  ${safe.length} added, ${existingCount} existing, ${cycleCount} cycles, ${missing.size} missing nodes`);
  console.log(`  Frontier: ${readyCount} ready, ${blockedCount} blocked, ${doneCount} done/graveyard`);
}

main().catch((err) => {
  console.error(chalk.red(`[FATAL] ${err instanceof Error ? err.message : String(err)}`));
  process.exit(1);
});
