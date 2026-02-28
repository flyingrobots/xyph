#!/usr/bin/env -S npx tsx
/**
 * Wave 2 campaign links: assign remaining orphan task groups to campaigns.
 */

import WarpGraph, { GitGraphAdapter } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';
import chalk from 'chalk';
import { createPatchSession } from '../src/infrastructure/helpers/createPatchSession.js';

const WRITER_ID = process.env['XYPH_AGENT_ID'] ?? 'agent.prime';
const plumbing = Plumbing.createDefault({ cwd: process.cwd() });
const persistence = new GitGraphAdapter({ plumbing });

interface LinkSpec {
  taskId: string;
  campaignId: string;
  intentId: string;
}

const LINKS: LinkSpec[] = [
  // OVR-* → campaign:DASHBOARD / intent:DASHBOARD
  ...['OVR-001', 'OVR-002', 'OVR-003', 'OVR-004', 'OVR-005', 'OVR-006',
    'OVR-007', 'OVR-008', 'OVR-009', 'OVR-010', 'OVR-011', 'OVR-012']
    .map(id => ({ taskId: `task:${id}`, campaignId: 'campaign:DASHBOARD', intentId: 'intent:DASHBOARD' })),

  // LIN-* → campaign:DASHBOARD / intent:DASHBOARD
  ...['LIN-001', 'LIN-002', 'LIN-003']
    .map(id => ({ taskId: `task:${id}`, campaignId: 'campaign:DASHBOARD', intentId: 'intent:DASHBOARD' })),

  // GRV-* → campaign:DASHBOARD / intent:DASHBOARD
  ...['GRV-001', 'GRV-002', 'GRV-003']
    .map(id => ({ taskId: `task:${id}`, campaignId: 'campaign:DASHBOARD', intentId: 'intent:DASHBOARD' })),

  // VOC-* → campaign:DASHBOARD / intent:DASHBOARD (vocab is a dashboard concern)
  ...['VOC-001', 'VOC-002', 'VOC-003']
    .map(id => ({ taskId: `task:${id}`, campaignId: 'campaign:DASHBOARD', intentId: 'intent:DASHBOARD' })),

  // Remaining AGT-* → campaign:AGENT / intent:AGENT-PROTOCOL
  ...['AGT-002', 'AGT-004', 'AGT-005', 'AGT-006', 'AGT-008', 'AGT-009',
    'AGT-010', 'AGT-011', 'AGT-012', 'AGT-013']
    .map(id => ({ taskId: `task:${id}`, campaignId: 'campaign:AGENT', intentId: 'intent:AGENT-PROTOCOL' })),

  // TRG-004, TRG-005 → campaign:TRIAGE / intent:SOVEREIGNTY
  ...['TRG-004', 'TRG-005']
    .map(id => ({ taskId: `task:${id}`, campaignId: 'campaign:TRIAGE', intentId: 'intent:SOVEREIGNTY' })),
];

async function main(): Promise<void> {
  console.log(chalk.bold(`\nCampaign Links — Wave 2  (writer: ${WRITER_ID})\n`));

  const graph = await WarpGraph.open({
    persistence,
    graphName: 'xyph-roadmap',
    writerId: WRITER_ID,
    autoMaterialize: true,
  });
  await graph.syncCoverage();
  await graph.materialize();

  // Verify all nodes exist
  const missing: string[] = [];
  for (const { taskId, campaignId, intentId } of LINKS) {
    for (const id of [taskId, campaignId, intentId]) {
      const exists = await graph.hasNode(id);
      if (!exists) missing.push(id);
    }
  }
  if (missing.length > 0) {
    console.log(chalk.red(`  Missing: ${[...new Set(missing)].join(', ')}`));
    return;
  }

  // Group by campaign
  const byCampaign = new Map<string, LinkSpec[]>();
  for (const spec of LINKS) {
    const arr = byCampaign.get(spec.campaignId) ?? [];
    arr.push(spec);
    byCampaign.set(spec.campaignId, arr);
  }

  for (const [campaignId, specs] of byCampaign) {
    const ids = specs.map(s => s.taskId.replace('task:', '')).join(', ');
    const patch = await createPatchSession(graph);
    for (const { taskId, campaignId: cId, intentId } of specs) {
      patch.addEdge(taskId, cId, 'belongs-to')
        .addEdge(taskId, intentId, 'authorized-by');
    }
    const sha = await patch.commit();
    console.log(chalk.green(`  [OK] ${campaignId} ← [${ids}] → ${sha.slice(0, 12)}`));
    await graph.materialize();
  }

  console.log(chalk.bold.green(`\n${LINKS.length} tasks linked to campaigns.`));
}

main().catch((err) => {
  console.error(chalk.red(`[FATAL] ${err instanceof Error ? err.message : String(err)}`));
  process.exit(1);
});
