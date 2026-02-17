#!/usr/bin/env -S npx tsx
import WarpGraph, { GitGraphAdapter } from '@git-stunts/git-warp';
import type { PatchSession } from '@git-stunts/git-warp';
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
  .option('--intent <id>', 'Sovereign Intent node that authorizes this Quest (intent:* prefix)')
  .action(async (id: string, opts: { title: string; campaign: string; hours?: number; intent?: string }) => {
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

      if (opts.intent) {
        if (!opts.intent.startsWith('intent:')) {
          console.error(chalk.red(`[ERROR] --intent value must start with 'intent:' prefix, got: '${opts.intent}'`));
          process.exit(1);
        }
        patch.addEdge(id, opts.intent, 'authorized-by');
      }

      const sha = await patch.commit();
      console.log(chalk.green(`[OK] Quest ${id} initialized in campaign ${opts.campaign}. Patch: ${sha}`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`[ERROR] ${msg}`));
      process.exit(1);
    }
  });

// --- SOVEREIGNTY COMMANDS ---

program
  .command('intent <id>')
  .description('Declare a sovereign human Intent — the causal root of all Quests')
  .requiredOption('--title <text>', 'Statement of human desire (what and why)')
  .requiredOption('--requested-by <principal>', 'Human principal ID (must start with human.)')
  .option('--description <text>', 'Longer-form description of the intent')
  .action(async (id: string, opts: { title: string; requestedBy: string; description?: string }) => {
    try {
      if (!id.startsWith('intent:')) {
        console.error(chalk.red(`[ERROR] Intent ID must start with 'intent:' prefix, got: '${id}'`));
        process.exit(1);
      }
      if (!opts.requestedBy.startsWith('human.')) {
        console.error(chalk.red(
          `[ERROR] --requested-by must identify a human principal (start with 'human.'), got: '${opts.requestedBy}'`
        ));
        process.exit(1);
      }
      if (opts.title.length < 5) {
        console.error(chalk.red(`[ERROR] --title must be at least 5 characters`));
        process.exit(1);
      }

      const graph = await getGraph();
      const patch = await createPatch(graph);
      const now = Date.now();

      patch.addNode(id)
        .setProperty(id, 'title', opts.title)
        .setProperty(id, 'requested_by', opts.requestedBy)
        .setProperty(id, 'created_at', now)
        .setProperty(id, 'type', 'intent');

      if (opts.description) {
        patch.setProperty(id, 'description', opts.description);
      }

      const sha = await patch.commit();
      console.log(chalk.green(`[OK] Intent ${id} declared by ${opts.requestedBy}. Patch: ${sha}`));
      console.log(chalk.dim(`  Title: ${opts.title}`));
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
