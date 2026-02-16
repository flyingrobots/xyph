import WarpGraph, { GitGraphAdapter, PatchSession } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';
import { program, InvalidArgumentError } from 'commander';
import chalk from 'chalk';

/**
 * XYPH Actuator - The "Hands" of the Causal Agent.
 * Exposes the git-warp Node.js API as a CLI for agentic mutations.
 */

const DEFAULT_AGENT_ID = 'agent.prime';
const plumbing = Plumbing.createDefault({ cwd: process.cwd() });
const persistence = new GitGraphAdapter({ plumbing });

async function getGraph(): Promise<WarpGraph> {
  const writerId = process.env['XYPH_AGENT_ID'] || DEFAULT_AGENT_ID;
  // Every agent identifies as a unique writer in the XYPH roadmap
  const graph = await WarpGraph.open({
    persistence,
    graphName: 'xyph-roadmap',
    writerId,
    autoMaterialize: true,
  });

  // Ensure we see all writers in the repo
  await graph.syncCoverage();

  await graph.materialize();
  return graph;
}

async function createPatch(graph: WarpGraph): Promise<PatchSession> {
  return (await graph.createPatch()) as PatchSession;
}

function parseHours(val: string): number {
  const parsed = parseFloat(val);
  if (isNaN(parsed) || parsed < 0) {
    throw new InvalidArgumentError(`Invalid hours value: "${val}". Must be a non-negative number.`);
  }
  return parsed;
}

program
  .name('xyph-actuator')
  .description('Cryptographic Actuator for XYPH Causal Agents');

// --- INGEST COMMANDS ---

program
  .command('quest <id>')
  .description('Initialize a new Quest (Task) node')
  .requiredOption('--title <text>', 'Quest title')
  .requiredOption('--campaign <id>', 'Parent Campaign (Milestone) ID')
  .option('--hours <number>', 'Estimated human hours (PERT)', parseHours)
  .action(async (id: string, opts: { title: string; campaign: string; hours?: number }) => {
    try {
      const graph = await getGraph();
      const patch = await createPatch(graph);

      patch.addNode(id)
        .setProperty(id, 'title', opts.title)
        .setProperty(id, 'status', 'BACKLOG')
        .setProperty(id, 'hours', opts.hours ?? 0)
        .setProperty(id, 'type', 'task');

      if (opts.campaign && opts.campaign !== 'none') {
        patch.addEdge(id, opts.campaign, 'belongs-to');
      }

      const sha = await patch.commit();
      console.log(chalk.green(`[OK] Quest ${id} initialized in campaign ${opts.campaign}. Patch: ${sha}`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`[ERROR] ${msg}`));
      process.exit(1);
    }
  });

// --- COORDINATION COMMANDS ---

program
  .command('claim <id>')
  .description('Volunteer for a Quest (Optimistic Claiming Protocol)')
  .action(async (id: string) => {
    try {
      const agentId = process.env['XYPH_AGENT_ID'] || DEFAULT_AGENT_ID;
      const graph = await getGraph();

      console.log(chalk.yellow(`[*] Attempting to claim ${id} as ${agentId}...`));

      const patch = await createPatch(graph);
      patch.setProperty(id, 'assigned_to', agentId)
           .setProperty(id, 'status', 'IN_PROGRESS')
           .setProperty(id, 'claimed_at', Date.now());

      await patch.commit();

      // Verify claim post-materialization (The OCP Verification Step)
      await graph.materialize();
      const props = await graph.getNodeProps(id);

      if (props && props.get('assigned_to') === agentId) {
        console.log(chalk.green(`[OK] Claim confirmed. ${id} is yours.`));
      } else {
        const winner = props ? props.get('assigned_to') : 'unknown';
        console.log(chalk.red(`[FAIL] Lost race condition for ${id}. Current owner: ${winner}`));
        process.exit(1);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`[ERROR] ${msg}`));
      process.exit(1);
    }
  });

// --- ARTIFACT COMMANDS ---

program
  .command('seal <id>')
  .description('Mark Quest as DONE and seal with a Project Scroll')
  .requiredOption('--artifact <hash>', 'Content hash of the produced artifact')
  .requiredOption('--rationale <text>', 'Brief explanation of the solution')
  .action(async (id: string, opts: { artifact: string; rationale: string }) => {
    try {
      const graph = await getGraph();
      const patch = await createPatch(graph);

      const scrollId = `artifact:${id}`;

      patch.addNode(scrollId)
        .setProperty(scrollId, 'artifact_hash', opts.artifact)
        .setProperty(scrollId, 'rationale', opts.rationale)
        .setProperty(scrollId, 'type', 'scroll')
        .addEdge(scrollId, id, 'fulfills');

      patch.setProperty(id, 'status', 'DONE')
           .setProperty(id, 'completed_at', Date.now());

      const sha = await patch.commit();
      console.log(chalk.green(`[OK] Quest ${id} sealed. Scroll: ${scrollId}. Patch: ${sha}`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`[ERROR] ${msg}`));
      process.exit(1);
    }
  });

program.parse(process.argv);
