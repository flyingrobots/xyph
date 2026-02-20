import WarpGraph, { GitGraphAdapter } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';

const plumbing = Plumbing.createDefault({ cwd: process.cwd() });
const persistence = new GitGraphAdapter({ plumbing });
const graph = await WarpGraph.open({
  persistence,
  graphName: 'xyph-roadmap',
  writerId: 'agent.prime',
  autoMaterialize: true,
});
await graph.syncCoverage();
await graph.materialize();

const nodes: string[] = await graph.getNodes() as unknown as string[];
console.log(`Graph has ${nodes.length} nodes\n`);

let problemCount = 0;

for (const id of nodes) {
  const props = await graph.getNodeProps(id);
  const outgoing = (await graph.neighbors(id, 'outgoing')) as Array<{ label: string; nodeId: string }>;
  const incoming = (await graph.neighbors(id, 'incoming')) as Array<{ label: string; nodeId: string }>;
  const type = props?.get('type') ?? 'unknown';
  const title = props?.get('title') ?? '';
  const status = props?.get('status') ?? '';

  const issues: string[] = [];

  // Quests: should have belongs-to (campaign) and authorized-by (intent)
  // GRAVEYARD quests are decommissioned — structural integrity doesn't matter
  if (id.startsWith('task:') && status !== 'GRAVEYARD') {
    const belongsTo = outgoing.filter((e) => e.label === 'belongs-to');
    const authorizedBy = outgoing.filter((e) => e.label === 'authorized-by');
    if (belongsTo.length === 0) issues.push('NO belongs-to edge (no campaign)');
    if (authorizedBy.length === 0 && status !== 'INBOX')
      issues.push('NO authorized-by edge (no intent) — CONSTITUTION VIOLATION');
    if (type !== 'task') issues.push(`type="${type}" (expected "task")`);
    // Check edge targets exist
    for (const e of outgoing) {
      const exists = await graph.hasNode(e.nodeId);
      if (!exists) {
        issues.push(`DANGLING edge: --${e.label}--> ${e.nodeId} (node does not exist)`);
      }
    }
  }

  // Campaigns: check type
  if (id.startsWith('campaign:') || id.startsWith('milestone:')) {
    const inboundBelongs = incoming.filter((e) => e.label === 'belongs-to');
    if (type !== 'campaign' && type !== 'milestone')
      issues.push(`type="${type}" (expected "campaign")`);
    if (inboundBelongs.length === 0) issues.push('NO quests belong to this campaign');
  }

  // Intents: check for usage
  if (id.startsWith('intent:')) {
    const inboundAuth = incoming.filter((e) => e.label === 'authorized-by');
    if (inboundAuth.length === 0) issues.push('NO quests authorized by this intent (orphaned intent)');
    if (type !== 'intent') issues.push(`type="${type}" (expected "intent")`);
  }

  // Scrolls: must have fulfills edge
  if (id.startsWith('artifact:')) {
    const fulfills = outgoing.filter((e) => e.label === 'fulfills');
    if (fulfills.length === 0) issues.push('NO fulfills edge (orphaned scroll)');
    if (type !== 'scroll') issues.push(`type="${type}" (expected "scroll")`);
  }

  if (issues.length > 0) {
    problemCount++;
    console.log(`${id} (type="${type}", status="${status}")`);
    console.log(`  title: ${title}`);
    for (const i of issues) console.log(`  ⚠  ${i}`);
    console.log();
  }
}

// Check for unknown prefixes (skip GRAVEYARD nodes)
const knownPrefixes = ['task:', 'artifact:', 'campaign:', 'milestone:', 'intent:', 'approval:'];
for (const id of nodes) {
  if (!knownPrefixes.some((p) => id.startsWith(p))) {
    const props = await graph.getNodeProps(id);
    const nodeStatus = props?.get('status');
    if (nodeStatus === 'GRAVEYARD') continue;
    problemCount++;
    console.log(`UNKNOWN PREFIX: ${id} (type="${props?.get('type')}")\n`);
  }
}

console.log(`--- ${problemCount} node(s) with issues out of ${nodes.length} total ---`);
process.exit(problemCount > 0 ? 1 : 0);
