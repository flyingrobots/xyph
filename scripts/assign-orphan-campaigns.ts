#!/usr/bin/env -S npx tsx
/**
 * Assign orphan quests to their correct campaigns.
 *
 * Idempotent — safe to run multiple times. Checks for existing
 * `belongs-to` edges before adding new ones.
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
// Campaign assignments: quest → campaign
// ---------------------------------------------------------------------------

interface Assignment {
  quest: string;
  campaign: string;
}

// DONE orphans — historical bookkeeping
const DONE_ASSIGNMENTS: Assignment[] = [
  { quest: 'task:ACT-001', campaign: 'campaign:CLITOOL' },
  { quest: 'task:ACT-002', campaign: 'campaign:CLITOOL' },
  { quest: 'task:ACT-003', campaign: 'campaign:CLITOOL' },
  { quest: 'task:ACT-004', campaign: 'campaign:CLITOOL' },
  { quest: 'task:ACT-005', campaign: 'campaign:CLITOOL' },
  { quest: 'task:AGT-001', campaign: 'campaign:AGENT' },
  { quest: 'task:AGT-003', campaign: 'campaign:AGENT' },
  { quest: 'task:AGT-007', campaign: 'campaign:AGENT' },
  { quest: 'task:cli-rename-inbox-backlog', campaign: 'campaign:CLITOOL' },
  { quest: 'task:command-palette', campaign: 'campaign:DASHBOARD' },
  { quest: 'task:doc-data-contracts-rewrite', campaign: 'campaign:CLITOOL' },
  { quest: 'task:doc-graph-schema-rewrite', campaign: 'campaign:CLITOOL' },
  { quest: 'task:ink-fullscreen-pr', campaign: 'campaign:DASHBOARD' },
  { quest: 'task:inkstatus-type-safety', campaign: 'campaign:DASHBOARD' },
  { quest: 'task:submission-read-perf', campaign: 'campaign:SUBMISSION' },
  { quest: 'task:vision-doc-polish', campaign: 'campaign:BEDROCK' },
];

// BACKLOG orphans — active work routing
const BACKLOG_ASSIGNMENTS: Assignment[] = [
  // → campaign:DASHBOARD (19 quests) — TUI, bijou, rendering
  { quest: 'task:appframe-migration', campaign: 'campaign:DASHBOARD' },
  { quest: 'task:bijou-dag-renderer', campaign: 'campaign:DASHBOARD' },
  { quest: 'task:bijou-generic-resolved-theme', campaign: 'campaign:DASHBOARD' },
  { quest: 'task:bijou-type-guards', campaign: 'campaign:DASHBOARD' },
  { quest: 'task:bijou-v09-title-refactor', campaign: 'campaign:DASHBOARD' },
  { quest: 'task:confirm-overlay-integration-test', campaign: 'campaign:DASHBOARD' },
  { quest: 'task:dag-visualization', campaign: 'campaign:DASHBOARD' },
  { quest: 'task:dashboard-adapter-error-isolation', campaign: 'campaign:DASHBOARD' },
  { quest: 'task:dashboard-focus-clamp-test', campaign: 'campaign:DASHBOARD' },
  { quest: 'task:dashboard-visibility-constants', campaign: 'campaign:DASHBOARD' },
  { quest: 'task:e2e-dashboard-smoke', campaign: 'campaign:DASHBOARD' },
  { quest: 'task:graphmeta-drop-tipsha', campaign: 'campaign:DASHBOARD' },
  { quest: 'task:no-tui-mode', campaign: 'campaign:DASHBOARD' },
  { quest: 'task:snapshot-render-regression', campaign: 'campaign:DASHBOARD' },
  { quest: 'task:tui-logger-unit-tests', campaign: 'campaign:DASHBOARD' },
  { quest: 'task:tui-runscript-tests', campaign: 'campaign:DASHBOARD' },
  { quest: 'task:upstream-ink-fullscreen', campaign: 'campaign:DASHBOARD' },
  { quest: 'task:warp-explorer-view', campaign: 'campaign:DASHBOARD' },
  { quest: 'task:worker-thread-loading', campaign: 'campaign:DASHBOARD' },

  // → campaign:CLITOOL (16 quests) — CLI, CI, testing, theme
  { quest: 'task:actuator-theme-destructure', campaign: 'campaign:CLITOOL' },
  { quest: 'task:advisory-doc-versioning', campaign: 'campaign:CLITOOL' },
  { quest: 'task:coverage-threshold', campaign: 'campaign:CLITOOL' },
  { quest: 'task:cross-adapter-test-stability', campaign: 'campaign:CLITOOL' },
  { quest: 'task:docstring-coverage', campaign: 'campaign:CLITOOL' },
  { quest: 'task:git-hooks-lifecycle', campaign: 'campaign:CLITOOL' },
  { quest: 'task:inline-color-status', campaign: 'campaign:CLITOOL' },
  { quest: 'task:lint-unused-interface-fields', campaign: 'campaign:CLITOOL' },
  { quest: 'task:pre-push-typecheck', campaign: 'campaign:CLITOOL' },
  { quest: 'task:style-guide-md040', campaign: 'campaign:CLITOOL' },
  { quest: 'task:terminology-lint', campaign: 'campaign:CLITOOL' },
  { quest: 'task:test-cross-type-depend', campaign: 'campaign:CLITOOL' },
  { quest: 'task:test-frontier-zero-edges', campaign: 'campaign:CLITOOL' },
  { quest: 'task:theme-preview-command', campaign: 'campaign:CLITOOL' },
  { quest: 'task:theme-shared-module', campaign: 'campaign:CLITOOL' },
  { quest: 'task:vi-stub-env-migration', campaign: 'campaign:CLITOOL' },

  // → campaign:ECOSYSTEM (6 quests) — external integrations, scaling
  { quest: 'task:benchmark-large-graphs', campaign: 'campaign:ECOSYSTEM' },
  { quest: 'task:graph-export-import', campaign: 'campaign:ECOSYSTEM' },
  { quest: 'task:ide-integration', campaign: 'campaign:ECOSYSTEM' },
  { quest: 'task:mcp-server', campaign: 'campaign:ECOSYSTEM' },
  { quest: 'task:multi-user-proof', campaign: 'campaign:ECOSYSTEM' },
  { quest: 'task:web-ui', campaign: 'campaign:ECOSYSTEM' },

  // → campaign:AGENT (1 quest)
  { quest: 'task:doc-agent-charter', campaign: 'campaign:AGENT' },
];

const ALL_ASSIGNMENTS: Assignment[] = [...DONE_ASSIGNMENTS, ...BACKLOG_ASSIGNMENTS];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(chalk.bold(`\nAssign Orphan Quests to Campaigns  (writer: ${WRITER_ID})\n`));

  const graph = await openGraph();
  const patch = await createPatchSession(graph);

  let assigned = 0;
  let skipped = 0;
  let missing = 0;

  for (const { quest, campaign } of ALL_ASSIGNMENTS) {
    const exists = await graph.hasNode(quest);
    if (!exists) {
      console.log(chalk.red(`  [MISSING] ${quest} — node does not exist`));
      missing++;
      continue;
    }

    // Validate campaign node exists
    const campaignExists = await graph.hasNode(campaign);
    if (!campaignExists) {
      console.log(chalk.red(`  [MISSING CAMPAIGN] ${campaign} — campaign node does not exist, skipping ${quest}`));
      missing++;
      continue;
    }

    // Check if belongs-to edge already exists
    const neighbors = toNeighborEntries(await graph.neighbors(quest, 'outgoing'));
    const alreadyAssigned = neighbors.some(
      (n) => n.label === 'belongs-to' && n.nodeId === campaign,
    );

    if (alreadyAssigned) {
      console.log(chalk.gray(`  [SKIP] ${quest} → ${campaign} (already assigned)`));
      skipped++;
      continue;
    }

    // Check for assignment to a different campaign — skip to preserve single-campaign cardinality
    const otherCampaign = neighbors.find((n) => n.label === 'belongs-to');
    if (otherCampaign) {
      console.log(chalk.yellow(
        `  [SKIP] ${quest} already belongs to ${otherCampaign.nodeId}, not re-assigning to ${campaign}`,
      ));
      skipped++;
      continue;
    }

    patch.addEdge(quest, campaign, 'belongs-to');
    console.log(chalk.green(`  [ASSIGN] ${quest} → ${campaign}`));
    assigned++;
  }

  if (assigned === 0) {
    console.log(chalk.bold.yellow('\nNo changes needed — all quests already assigned.'));
    return;
  }

  const sha = await patch.commit();
  await graph.materialize();

  console.log(chalk.bold.green('\nAssignment complete.'));
  console.log(`  ${assigned} quests assigned, ${skipped} skipped, ${missing} missing`);
  console.log(`  Patch SHA: ${sha.slice(0, 12)}`);
}

main().catch((err) => {
  console.error(chalk.red(`[FATAL] ${err instanceof Error ? err.message : String(err)}`));
  process.exit(1);
});
