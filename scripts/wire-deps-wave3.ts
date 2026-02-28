#!/usr/bin/env -S npx tsx
/**
 * Wave 3: Wire remaining obvious dependency edges for tasks still
 * sitting in the frontier that logically need prerequisites.
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

// [from, to, reason] — from depends on to
const WAVE3_EDGES: Array<[string, string, string]> = [
  // dag-visualization needs bijou-dag-renderer built first
  ['task:dag-visualization', 'task:bijou-dag-renderer', 'dag viz uses bijou dag component'],

  // theme-preview needs shared module extracted first
  ['task:theme-preview-command', 'task:theme-shared-module', 'preview uses shared theme module'],

  // warp-explorer-view is a TUI feature, needs bijou port
  ['task:warp-explorer-view', 'task:BJU-002', 'explorer view built on bijou TUI'],

  // no-tui-mode (headless/CI) needs the binary entry point
  ['task:no-tui-mode', 'task:BX-001', 'headless mode is a flag on the binary'],

  // MCP server exposes graph as structured API, needs cli-api layer
  ['task:mcp-server', 'task:cli-api', 'MCP server wraps CLI API layer'],

  // multi-user-proof needs identity resolution
  ['task:multi-user-proof', 'task:BX-002', 'multi-user needs identity resolution'],

  // web-ui needs the JSON API layer
  ['task:web-ui', 'task:cli-api', 'web UI consumes JSON API'],

  // dashboard-adapter-error-isolation improves the bijou adapter
  ['task:dashboard-adapter-error-isolation', 'task:BJU-002', 'error isolation for bijou adapter'],

  // dashboard-resize-handler needs bijou TUI running
  ['task:dashboard-resize-handler', 'task:BJU-002', 'resize handler for bijou TUI'],

  // snapshot-render tests need bijou views to exist
  ['task:snapshot-render', 'task:BJU-002', 'snapshot tests need bijou views'],

  // inline-color-strings depends on theme-shared-module
  ['task:inline-color-strings', 'task:theme-shared-module', 'inline colors replaced by shared theme'],

  // actuator-theme-destructure depends on theme-shared-module
  ['task:actuator-theme-destructure', 'task:theme-shared-module', 'destructure uses shared theme tokens'],

  // tui-submission-stepper needs BJU-002 (bijou components)
  ['task:tui-submission-stepper', 'task:BJU-002', 'stepper built with bijou components'],

  // tui-min-size-guard needs BJU-002 (bijou TUI running)
  ['task:tui-min-size-guard', 'task:BJU-002', 'min size guard for bijou TUI'],

  // tui-logger-unit-tests should come after BJU-002
  ['task:tui-logger-unit-tests', 'task:BJU-002', 'logger tests need bijou port context'],

  // statusline-graph-health is already blocked on BJU-002 (wave 2) — skip

  // git-hooks-lifecycle depends on BX-001 (binary packaging)
  ['task:git-hooks-lifecycle', 'task:BX-001', 'git hooks need packaged binary'],

  // ide-integration needs BX-001 (binary) + cli-api (structured output)
  ['task:ide-integration', 'task:BX-001', 'IDE extension wraps binary'],
  ['task:ide-integration', 'task:cli-api', 'IDE extension uses JSON API'],

  // e2e-dashboard-smoke already blocked on BJU-002 (wave 2) — skip

  // graph-export-import needs cli-api for structured I/O
  ['task:graph-export-import', 'task:cli-api', 'export/import uses structured API'],

  // help-modal-warp-glossary needs BJU-002 (bijou TUI)
  ['task:help-modal-warp-glossary', 'task:BJU-002', 'help modal is bijou component'],

  // pre-push-typecheck depends on coverage-threshold (both CI tasks, sequential)
  ['task:pre-push-typecheck', 'task:coverage-threshold', 'push hook after coverage config'],

  // lint-unused-int depends on coverage-threshold (CI quality, sequential)
  ['task:lint-unused-int', 'task:coverage-threshold', 'lint rules after coverage config'],

  // traceability-m1-m7 needs BX-017 (HistoryPort for provenance queries)
  ['task:traceability-m1-m7', 'task:BX-017', 'traceability queries via HistoryPort'],

  // style-guide-md needs several docs done first — depend on doc-tui-plan-update
  ['task:style-guide-md0', 'task:doc-tui-plan-update', 'style guide after plan docs updated'],

  // SUB-SCHEMA-001 (decision prefix collision) should be fixed before DSH-002
  ['task:DSH-002', 'task:SUB-SCHEMA-001', 'fix prefix collision before campaign command'],
];

async function main(): Promise<void> {
  console.log(chalk.bold(`\nDependency Wiring — Wave 3  (writer: ${WRITER_ID})\n`));

  const graph = await openGraph();

  // Verify nodes
  console.log(chalk.cyan('── Verifying nodes ──'));
  const allIds = new Set<string>();
  for (const [from, to] of WAVE3_EDGES) {
    allIds.add(from);
    allIds.add(to);
  }

  const missing: string[] = [];
  for (const id of allIds) {
    const exists = await graph.hasNode(id);
    if (!exists) missing.push(id);
  }
  if (missing.length > 0) {
    console.log(chalk.yellow(`  Missing nodes (will skip): ${missing.join(', ')}`));
  } else {
    console.log(chalk.green(`  All ${allIds.size} nodes verified`));
  }

  // Filter to edges where both nodes exist
  const validEdges = WAVE3_EDGES.filter(
    ([from, to]) => !missing.includes(from) && !missing.includes(to),
  );

  // Cycle detection
  console.log(chalk.cyan('\n── Cycle detection ──'));
  const safe: Array<[string, string]> = [];
  let skipped = 0;

  for (const [from, to, reason] of validEdges) {
    const { reachable } = await graph.traverse.isReachable(to, from, {
      labelFilter: 'depends-on',
    });
    if (reachable) {
      console.log(chalk.yellow(`  [SKIP] ${from} → ${to}: would create cycle (${reason})`));
      skipped++;
    } else {
      safe.push([from, to]);
    }
  }

  // Commit
  console.log(chalk.cyan(`\n── Committing ${safe.length} edges ──`));
  const patch = await createPatchSession(graph);
  for (const [from, to] of safe) {
    patch.addEdge(from, to, 'depends-on');
  }
  const sha = await patch.commit();
  console.log(chalk.green(`  [OK] ${safe.length} depends-on edges (wave 3) → ${sha.slice(0, 12)}`));

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
    if (blocked) blockedCount++;
    else readyCount++;
  }

  console.log(chalk.bold.green(`\nWave 3 complete.`));
  console.log(`  ${safe.length} edges added, ${skipped} skipped (cycles), ${missing.length} missing nodes`);
  console.log(`  Frontier: ${readyCount} ready, ${blockedCount} blocked`);
}

main().catch((err) => {
  console.error(chalk.red(`[FATAL] ${err instanceof Error ? err.message : String(err)}`));
  process.exit(1);
});
