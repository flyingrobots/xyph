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
  const writerId = process.env['XYPH_AGENT_ID'] ?? DEFAULT_AGENT_ID;
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
      // Validate all inputs before any async graph I/O
      if (!opts.intent) {
        console.error(chalk.red(
          `[CONSTITUTION VIOLATION] Quest ${id} requires --intent <id> (Art. IV — Genealogy of Intent).\n` +
          `  Every Quest must trace its lineage to a sovereign human Intent.\n` +
          `  Declare one first: xyph-actuator intent <id> --title "..." --requested-by human.<name>`
        ));
        process.exit(1);
      }
      if (!opts.intent.startsWith('intent:')) {
        console.error(chalk.red(`[ERROR] --intent value must start with 'intent:' prefix, got: '${opts.intent}'`));
        process.exit(1);
      }

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

      patch.addEdge(id, opts.intent, 'authorized-by');

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
      const agentId = process.env['XYPH_AGENT_ID'] ?? DEFAULT_AGENT_ID;
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
      const agentId = process.env['XYPH_AGENT_ID'] ?? DEFAULT_AGENT_ID;
      const { GuildSealService } = await import('./src/domain/services/GuildSealService.js');
      const sealService = new GuildSealService();

      const now = Date.now();
      const scrollPayload = {
        artifactHash: opts.artifact,
        questId: id,
        rationale: opts.rationale,
        sealedBy: agentId,
        sealedAt: now,
      };

      const guildSeal = await sealService.sign(scrollPayload, agentId);

      const graph = await getGraph();
      const patch = await createPatch(graph);
      const scrollId = `artifact:${id}`;

      patch.addNode(scrollId)
        .setProperty(scrollId, 'artifact_hash', opts.artifact)
        .setProperty(scrollId, 'rationale', opts.rationale)
        .setProperty(scrollId, 'type', 'scroll')
        .setProperty(scrollId, 'sealed_by', agentId)
        .setProperty(scrollId, 'sealed_at', now)
        .setProperty(scrollId, 'payload_digest', sealService.payloadDigest(scrollPayload))
        .addEdge(scrollId, id, 'fulfills');

      if (guildSeal) {
        patch.setProperty(scrollId, 'guild_seal_alg', guildSeal.alg)
             .setProperty(scrollId, 'guild_seal_key_id', guildSeal.keyId)
             .setProperty(scrollId, 'guild_seal_sig', guildSeal.sig);
        console.log(chalk.dim(`  Guild Seal: ${guildSeal.keyId}`));
      } else {
        console.log(chalk.yellow(`  [WARN] No private key found for ${agentId} — scroll is unsigned. Run: xyph-actuator generate-key`));
      }

      patch.setProperty(id, 'status', 'DONE')
           .setProperty(id, 'completed_at', now);

      const sha = await patch.commit();
      console.log(chalk.green(`[OK] Quest ${id} sealed. Scroll: ${scrollId}. Patch: ${sha}`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`[ERROR] ${msg}`));
      process.exit(1);
    }
  });

program
  .command('generate-key')
  .description('Generate an Ed25519 Guild Seal keypair for this agent')
  .action(async () => {
    try {
      const agentId = process.env['XYPH_AGENT_ID'] ?? DEFAULT_AGENT_ID;
      const { GuildSealService } = await import('./src/domain/services/GuildSealService.js');
      const sealService = new GuildSealService();

      const { keyId, publicKeyHex } = await sealService.generateKeypair(agentId);
      console.log(chalk.green(`[OK] Keypair generated for agent ${agentId}`));
      console.log(chalk.dim(`  Key ID:     ${keyId}`));
      console.log(chalk.dim(`  Public key: ${publicKeyHex}`));
      console.log(chalk.dim(`  Private key stored in trust/${agentId}.sk (gitignored)`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`[ERROR] ${msg}`));
      process.exit(1);
    }
  });

// --- INTAKE COMMANDS ---

program
  .command('inbox <id>')
  .description('Suggest a task for triage — adds to INBOX with provenance tracking')
  .requiredOption('--title <text>', 'Task description')
  .requiredOption('--suggested-by <principal>', 'Who is suggesting this task (human.* or agent.*)')
  .option('--hours <number>', 'Estimated hours', parseHours)
  .action(async (id: string, opts: { title: string; suggestedBy: string; hours?: number }) => {
    try {
      if (!id.startsWith('task:')) {
        console.error(chalk.red(`[ERROR] Task ID must start with 'task:', got: '${id}'`));
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
        .setProperty(id, 'status', 'INBOX')
        .setProperty(id, 'hours', opts.hours ?? 0)
        .setProperty(id, 'type', 'task')
        .setProperty(id, 'suggested_by', opts.suggestedBy)
        .setProperty(id, 'suggested_at', now);

      const sha = await patch.commit();
      console.log(chalk.green(`[OK] Task ${id} added to INBOX.`));
      console.log(chalk.dim(`  Suggested by: ${opts.suggestedBy}`));
      console.log(chalk.dim(`  Patch: ${sha}`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`[ERROR] ${msg}`));
      process.exit(1);
    }
  });

program
  .command('promote <id>')
  .description('Promote an INBOX task to BACKLOG — human authority + sovereign intent required')
  .requiredOption('--intent <id>', 'Sovereign Intent ID (intent:* prefix)')
  .option('--campaign <id>', 'Campaign to assign (optional, assignable later)')
  .action(async (id: string, opts: { intent: string; campaign?: string }) => {
    try {
      const agentId = process.env['XYPH_AGENT_ID'] ?? DEFAULT_AGENT_ID;
      const { WarpIntakeAdapter } = await import('./src/infrastructure/adapters/WarpIntakeAdapter.js');

      const intake = new WarpIntakeAdapter(process.cwd(), agentId);
      const sha = await intake.promote(id, opts.intent, opts.campaign);

      console.log(chalk.green(`[OK] Task ${id} promoted to BACKLOG.`));
      console.log(chalk.dim(`  Intent:   ${opts.intent}`));
      if (opts.campaign !== undefined) console.log(chalk.dim(`  Campaign: ${opts.campaign}`));
      console.log(chalk.dim(`  Patch: ${sha}`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`[ERROR] ${msg}`));
      process.exit(1);
    }
  });

program
  .command('reject <id>')
  .description('Reject an INBOX task to GRAVEYARD — rationale required')
  .requiredOption('--rationale <text>', 'Reason for rejection (non-empty)')
  .action(async (id: string, opts: { rationale: string }) => {
    try {
      const agentId = process.env['XYPH_AGENT_ID'] ?? DEFAULT_AGENT_ID;
      const { WarpIntakeAdapter } = await import('./src/infrastructure/adapters/WarpIntakeAdapter.js');

      const intake = new WarpIntakeAdapter(process.cwd(), agentId);
      const sha = await intake.reject(id, opts.rationale);

      console.log(chalk.green(`[OK] Task ${id} moved to GRAVEYARD.`));
      console.log(chalk.dim(`  Rejected by: ${agentId}`));
      console.log(chalk.dim(`  Rationale:   ${opts.rationale}`));
      console.log(chalk.dim(`  Patch: ${sha}`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`[ERROR] ${msg}`));
      process.exit(1);
    }
  });

program
  .command('reopen <id>')
  .description('Reopen a GRAVEYARD task back to INBOX — human authority required, history preserved')
  .action(async (id: string) => {
    try {
      const agentId = process.env['XYPH_AGENT_ID'] ?? DEFAULT_AGENT_ID;
      const { WarpIntakeAdapter } = await import('./src/infrastructure/adapters/WarpIntakeAdapter.js');

      const intake = new WarpIntakeAdapter(process.cwd(), agentId);
      const sha = await intake.reopen(id);

      console.log(chalk.green(`[OK] Task ${id} reopened to INBOX.`));
      console.log(chalk.dim(`  Reopened by: ${agentId}`));
      console.log(chalk.dim(`  Note: rejection history preserved in graph.`));
      console.log(chalk.dim(`  Patch: ${sha}`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`[ERROR] ${msg}`));
      process.exit(1);
    }
  });

// --- DASHBOARD COMMANDS ---

program
  .command('status')
  .description('Show a snapshot of the WARP graph')
  .option('--view <name>', 'roadmap | lineage | all | inbox', 'roadmap')
  .option('--include-graveyard', 'include GRAVEYARD tasks in output (excluded by default)')
  .action(async (opts: { view: string; includeGraveyard?: boolean }) => {
    try {
      const agentId = process.env['XYPH_AGENT_ID'] ?? DEFAULT_AGENT_ID;
      const { WarpDashboardAdapter } = await import('./src/infrastructure/adapters/WarpDashboardAdapter.js');
      const { DashboardService } = await import('./src/domain/services/DashboardService.js');
      const { renderRoadmap, renderLineage, renderAll, renderInbox } = await import('./src/tui/render-status.js');

      const adapter = new WarpDashboardAdapter(process.cwd(), agentId);
      const service = new DashboardService(adapter);
      const raw = await service.getSnapshot();
      const snapshot = service.filterSnapshot(raw, { includeGraveyard: opts.includeGraveyard ?? false });

      const view = opts.view;
      const validViews = ['roadmap', 'lineage', 'all', 'inbox'];
      if (!validViews.includes(view)) {
        console.error(chalk.red(`[ERROR] Unknown --view '${view}'. Valid options: ${validViews.join(', ')}`));
        process.exit(1);
      }
      if (view === 'lineage') {
        console.log(renderLineage(snapshot));
      } else if (view === 'all') {
        console.log(renderAll(snapshot));
      } else if (view === 'inbox') {
        console.log(renderInbox(snapshot));
      } else {
        console.log(renderRoadmap(snapshot));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`[ERROR] ${msg}`));
      process.exit(1);
    }
  });

program
  .command('audit-sovereignty')
  .description('Audit all BACKLOG quests for missing Genealogy of Intent (Constitution Art. IV)')
  .action(async () => {
    try {
      const { WarpRoadmapAdapter } = await import('./src/infrastructure/adapters/WarpRoadmapAdapter.js');
      const { SovereigntyService } = await import('./src/domain/services/SovereigntyService.js');

      const adapter = new WarpRoadmapAdapter(process.cwd(), 'xyph-roadmap', process.env['XYPH_AGENT_ID'] ?? DEFAULT_AGENT_ID);
      const service = new SovereigntyService(adapter);

      const violations = await service.auditBacklog();

      if (violations.length === 0) {
        console.log(chalk.green('[OK] All BACKLOG quests have a valid Genealogy of Intent.'));
      } else {
        console.log(chalk.red(`\n[VIOLATION] ${violations.length} quest(s) lack sovereign intent ancestry:\n`));
        for (const v of violations) {
          console.log(chalk.red(`  ✗ ${v.questId}`));
          console.log(chalk.dim(`    ${v.reason}`));
        }
        console.log(chalk.dim(`\n  Fix: xyph-actuator quest <id> --intent <intent:ID> ...`));
        process.exit(1);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`[ERROR] ${msg}`));
      process.exit(1);
    }
  });

program.parse(process.argv);
