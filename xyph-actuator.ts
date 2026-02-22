#!/usr/bin/env -S npx tsx
import { randomUUID } from 'node:crypto';
import WarpGraph, { GitGraphAdapter } from '@git-stunts/git-warp';
import Plumbing from '@git-stunts/plumbing';
import { program, InvalidArgumentError } from 'commander';
import chalk from 'chalk';
import { createPatchSession } from './src/infrastructure/helpers/createPatchSession.js';

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

const createPatch = createPatchSession;

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
  .requiredOption('--campaign <id>', 'Parent Campaign (Milestone) ID (use "none" to skip)')
  .option('--hours <number>', 'Estimated human hours (PERT)', parseHours)
  .option('--intent <id>', 'Sovereign Intent node that authorizes this Quest (intent:* prefix)')
  .action(async (id: string, opts: { title: string; campaign: string; hours?: number; intent?: string }) => {
    try {
      // Validate all inputs before any async graph I/O
      if (!id.startsWith('task:')) {
        console.error(chalk.red(`[ERROR] Quest ID must start with 'task:' prefix, got: '${id}'`));
        process.exit(1);
      }
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

      if (opts.campaign !== 'none') {
        patch.addEdge(id, opts.campaign, 'belongs-to');
      }

      patch.addEdge(id, opts.intent, 'authorized-by');

      const sha = await patch.commit();
      const campaignNote = opts.campaign === 'none' ? '(no campaign)' : `in campaign ${opts.campaign}`;
      console.log(chalk.green(`[OK] Quest ${id} initialized ${campaignNote}. Patch: ${sha}`));
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

      // Guard: warn if a non-terminal submission exists for this quest
      try {
        const { WarpSubmissionAdapter } = await import('./src/infrastructure/adapters/WarpSubmissionAdapter.js');
        const subAdapter = new WarpSubmissionAdapter(process.cwd(), agentId);
        const openSubs = await subAdapter.getOpenSubmissionsForQuest(id);
        if (openSubs.length > 0) {
          console.log(chalk.yellow(
            `  [WARN] Quest ${id} has an open submission: ${openSubs[0]}\n` +
            `  Consider using 'xyph merge' instead of 'xyph seal' to settle via the review workflow.`
          ));
        }
      } catch {
        // Non-fatal: if submission lookup fails, seal still proceeds
      }

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

// --- SUBMISSION & REVIEW COMMANDS ---

/**
 * Generates a short unique ID for graph nodes.
 * Format: 9-char zero-padded base36 timestamp + 8-char hex random suffix (17 chars total).
 * Lexicographically sortable by creation time (covers until year 5188).
 */
function generateId(): string {
  const ts = Date.now().toString(36).padStart(9, '0');
  const rand = randomUUID().replace(/-/g, '').slice(0, 8);
  return `${ts}${rand}`;
}

program
  .command('submit <quest-id>')
  .description('Submit a quest for review — creates submission + first patchset')
  .requiredOption('--description <text>', 'Description of the changes (min 10 chars)')
  .option('--base <ref>', 'Base branch (default: main)', 'main')
  .option('--workspace <ref>', 'Workspace reference (default: current git branch)')
  .action(async (questId: string, opts: { description: string; base: string; workspace?: string }) => {
    try {
      const agentId = process.env['XYPH_AGENT_ID'] ?? DEFAULT_AGENT_ID;
      const { WarpSubmissionAdapter } = await import('./src/infrastructure/adapters/WarpSubmissionAdapter.js');
      const { SubmissionService } = await import('./src/domain/services/SubmissionService.js');
      const { GitWorkspaceAdapter } = await import('./src/infrastructure/adapters/GitWorkspaceAdapter.js');

      if (opts.description.length < 10) {
        console.error(chalk.red('[ERROR] --description must be at least 10 characters'));
        process.exit(1);
      }

      const adapter = new WarpSubmissionAdapter(process.cwd(), agentId);
      const service = new SubmissionService(adapter);
      await service.validateSubmit(questId, agentId);

      const workspace = new GitWorkspaceAdapter(process.cwd());
      const workspaceRef = opts.workspace ?? await workspace.getWorkspaceRef();
      let headRef: string | undefined;
      let commitShas: string[] | undefined;
      try {
        headRef = await workspace.getHeadCommit(workspaceRef);
        commitShas = await workspace.getCommitsSince(opts.base);
      } catch {
        // Non-fatal: workspace info is optional
      }

      const submissionId = `submission:${generateId()}`;
      const patchsetId = `patchset:${generateId()}`;

      const { patchSha } = await adapter.submit({
        questId,
        submissionId,
        patchsetId,
        patchset: {
          workspaceRef,
          baseRef: opts.base,
          headRef,
          commitShas,
          description: opts.description,
        },
      });

      console.log(chalk.green(`[OK] Submission ${submissionId} created.`));
      console.log(chalk.dim(`  Patchset:  ${patchsetId}`));
      console.log(chalk.dim(`  Quest:     ${questId}`));
      console.log(chalk.dim(`  Workspace: ${workspaceRef}`));
      console.log(chalk.dim(`  Patch:     ${patchSha}`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`[ERROR] ${msg}`));
      process.exit(1);
    }
  });

program
  .command('revise <submission-id>')
  .description('Add a new patchset to an existing submission, superseding the current tip')
  .requiredOption('--description <text>', 'Description of the revision (min 10 chars)')
  .option('--workspace <ref>', 'Workspace reference (default: current git branch)')
  .action(async (submissionId: string, opts: { description: string; workspace?: string }) => {
    try {
      const agentId = process.env['XYPH_AGENT_ID'] ?? DEFAULT_AGENT_ID;
      const { WarpSubmissionAdapter } = await import('./src/infrastructure/adapters/WarpSubmissionAdapter.js');
      const { SubmissionService } = await import('./src/domain/services/SubmissionService.js');
      const { GitWorkspaceAdapter } = await import('./src/infrastructure/adapters/GitWorkspaceAdapter.js');
      const { computeTipPatchset } = await import('./src/domain/entities/Submission.js');

      if (opts.description.length < 10) {
        console.error(chalk.red('[ERROR] --description must be at least 10 characters'));
        process.exit(1);
      }

      const adapter = new WarpSubmissionAdapter(process.cwd(), agentId);
      const service = new SubmissionService(adapter);
      await service.validateRevise(submissionId, agentId);

      // Find the current tip to supersede
      const patchsetRefs = await adapter.getPatchsetRefs(submissionId);
      const { tip } = computeTipPatchset(patchsetRefs);
      if (!tip) {
        console.error(chalk.red(`[ERROR] No existing patchsets found for ${submissionId}`));
        process.exit(1);
      }

      const workspace = new GitWorkspaceAdapter(process.cwd());
      const workspaceRef = opts.workspace ?? await workspace.getWorkspaceRef();
      let headRef: string | undefined;
      let commitShas: string[] | undefined;
      try {
        headRef = await workspace.getHeadCommit(workspaceRef);
        commitShas = await workspace.getCommitsSince('main');
      } catch {
        // Non-fatal
      }

      const patchsetId = `patchset:${generateId()}`;

      const { patchSha } = await adapter.revise({
        submissionId,
        patchsetId,
        supersedesPatchsetId: tip.id,
        patchset: {
          workspaceRef,
          headRef,
          commitShas,
          description: opts.description,
        },
      });

      console.log(chalk.green(`[OK] Revision ${patchsetId} created.`));
      console.log(chalk.dim(`  Supersedes: ${tip.id}`));
      console.log(chalk.dim(`  Workspace:  ${workspaceRef}`));
      console.log(chalk.dim(`  Patch:      ${patchSha}`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`[ERROR] ${msg}`));
      process.exit(1);
    }
  });

program
  .command('review <patchset-id>')
  .description('Review a patchset — approve, request changes, or comment')
  .requiredOption('--verdict <type>', 'approve | request-changes | comment')
  .requiredOption('--comment <text>', 'Review feedback')
  .action(async (patchsetId: string, opts: { verdict: string; comment: string }) => {
    try {
      const agentId = process.env['XYPH_AGENT_ID'] ?? DEFAULT_AGENT_ID;
      const { WarpSubmissionAdapter } = await import('./src/infrastructure/adapters/WarpSubmissionAdapter.js');
      const { SubmissionService } = await import('./src/domain/services/SubmissionService.js');

      const validVerdicts = ['approve', 'request-changes', 'comment'] as const;
      if (!validVerdicts.includes(opts.verdict as typeof validVerdicts[number])) {
        console.error(chalk.red(
          `[ERROR] --verdict must be one of: ${validVerdicts.join(', ')}. Got: '${opts.verdict}'`
        ));
        process.exit(1);
      }

      const adapter = new WarpSubmissionAdapter(process.cwd(), agentId);
      const service = new SubmissionService(adapter);
      await service.validateReview(patchsetId, agentId);

      const reviewId = `review:${generateId()}`;
      const verdict = opts.verdict as 'approve' | 'request-changes' | 'comment';

      const { patchSha } = await adapter.review({
        patchsetId,
        reviewId,
        verdict,
        comment: opts.comment,
      });

      console.log(chalk.green(`[OK] Review ${reviewId} posted.`));
      console.log(chalk.dim(`  Verdict:  ${verdict}`));
      console.log(chalk.dim(`  Patchset: ${patchsetId}`));
      console.log(chalk.dim(`  Patch:    ${patchSha}`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`[ERROR] ${msg}`));
      process.exit(1);
    }
  });

program
  .command('merge <submission-id>')
  .description('Merge a submission — settles the workspace and auto-seals the quest')
  .requiredOption('--rationale <text>', 'Merge rationale')
  .option('--into <ref>', 'Target branch', 'main')
  .option('--patchset <id>', 'Explicit patchset ID (required when multiple heads exist)')
  .action(async (submissionId: string, opts: { rationale: string; into: string; patchset?: string }) => {
    try {
      const agentId = process.env['XYPH_AGENT_ID'] ?? DEFAULT_AGENT_ID;
      const { WarpSubmissionAdapter } = await import('./src/infrastructure/adapters/WarpSubmissionAdapter.js');
      const { SubmissionService } = await import('./src/domain/services/SubmissionService.js');
      const { GitWorkspaceAdapter } = await import('./src/infrastructure/adapters/GitWorkspaceAdapter.js');
      const { GuildSealService } = await import('./src/domain/services/GuildSealService.js');

      const adapter = new WarpSubmissionAdapter(process.cwd(), agentId);
      const service = new SubmissionService(adapter);
      const { tipPatchsetId } = await service.validateMerge(submissionId, agentId, opts.patchset);

      // Get workspace ref from the tip patchset for git settlement
      const graph = await getGraph();
      const tipProps = await graph.getNodeProps(tipPatchsetId);
      const workspaceRef = tipProps?.get('workspace_ref');
      if (typeof workspaceRef !== 'string') {
        console.error(chalk.red(`[ERROR] Could not resolve workspace ref from patchset ${tipPatchsetId}`));
        process.exit(1);
      }

      // Git settlement
      const workspace = new GitWorkspaceAdapter(process.cwd());
      let mergeCommit: string | undefined;
      const alreadyMerged = await workspace.isMerged(workspaceRef, opts.into);
      if (alreadyMerged) {
        mergeCommit = await workspace.getHeadCommit(opts.into);
        console.log(chalk.dim(`  Branch ${workspaceRef} already merged into ${opts.into}`));
      } else {
        mergeCommit = await workspace.merge(workspaceRef, opts.into);
        console.log(chalk.dim(`  Merged ${workspaceRef} into ${opts.into}: ${mergeCommit.slice(0, 7)}`));
      }

      // Create merge decision
      const decisionId = `decision:${generateId()}`;
      const { patchSha } = await adapter.decide({
        submissionId,
        decisionId,
        kind: 'merge',
        rationale: opts.rationale,
        mergeCommit,
      });

      // Auto-seal: create scroll + sign with GuildSealService + set quest DONE
      const questId = await adapter.getSubmissionQuestId(submissionId);
      if (questId) {
        const now = Date.now();
        const sealService = new GuildSealService();
        const scrollPayload = {
          artifactHash: mergeCommit ?? 'unknown',
          questId,
          rationale: opts.rationale,
          sealedBy: agentId,
          sealedAt: now,
        };
        const guildSeal = await sealService.sign(scrollPayload, agentId);

        const scrollId = `artifact:${questId}`;
        const patch = await createPatch(graph);
        patch
          .addNode(scrollId)
          .setProperty(scrollId, 'artifact_hash', mergeCommit ?? 'unknown')
          .setProperty(scrollId, 'rationale', opts.rationale)
          .setProperty(scrollId, 'type', 'scroll')
          .setProperty(scrollId, 'sealed_by', agentId)
          .setProperty(scrollId, 'sealed_at', now)
          .setProperty(scrollId, 'payload_digest', sealService.payloadDigest(scrollPayload))
          .addEdge(scrollId, questId, 'fulfills');

        if (guildSeal) {
          patch
            .setProperty(scrollId, 'guild_seal_alg', guildSeal.alg)
            .setProperty(scrollId, 'guild_seal_key_id', guildSeal.keyId)
            .setProperty(scrollId, 'guild_seal_sig', guildSeal.sig);
        }

        patch
          .setProperty(questId, 'status', 'DONE')
          .setProperty(questId, 'completed_at', now);
        await patch.commit();

        console.log(chalk.green(`[OK] Quest ${questId} auto-sealed via merge.`));
        if (guildSeal) {
          console.log(chalk.dim(`  Guild Seal: ${guildSeal.keyId}`));
        }
      }

      console.log(chalk.green(`[OK] Submission ${submissionId} merged.`));
      console.log(chalk.dim(`  Decision: ${decisionId}`));
      console.log(chalk.dim(`  Patch:    ${patchSha}`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`[ERROR] ${msg}`));
      process.exit(1);
    }
  });

program
  .command('close <submission-id>')
  .description('Close a submission without merging')
  .requiredOption('--rationale <text>', 'Reason for closing')
  .action(async (submissionId: string, opts: { rationale: string }) => {
    try {
      const agentId = process.env['XYPH_AGENT_ID'] ?? DEFAULT_AGENT_ID;
      const { WarpSubmissionAdapter } = await import('./src/infrastructure/adapters/WarpSubmissionAdapter.js');
      const { SubmissionService } = await import('./src/domain/services/SubmissionService.js');

      const adapter = new WarpSubmissionAdapter(process.cwd(), agentId);
      const service = new SubmissionService(adapter);
      await service.validateClose(submissionId, agentId);

      const decisionId = `decision:${generateId()}`;
      const { patchSha } = await adapter.decide({
        submissionId,
        decisionId,
        kind: 'close',
        rationale: opts.rationale,
      });

      console.log(chalk.green(`[OK] Submission ${submissionId} closed.`));
      console.log(chalk.dim(`  Decision:  ${decisionId}`));
      console.log(chalk.dim(`  Rationale: ${opts.rationale}`));
      console.log(chalk.dim(`  Patch:     ${patchSha}`));
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
      if (!opts.suggestedBy.startsWith('human.') && !opts.suggestedBy.startsWith('agent.')) {
        console.error(chalk.red(
          `[ERROR] --suggested-by must start with 'human.' or 'agent.', got: '${opts.suggestedBy}'`
        ));
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
  .option('--view <name>', 'roadmap | lineage | all | inbox | submissions', 'roadmap')
  .option('--include-graveyard', 'include GRAVEYARD tasks in output (excluded by default)')
  .action(async (opts: { view: string; includeGraveyard?: boolean }) => {
    try {
      const agentId = process.env['XYPH_AGENT_ID'] ?? DEFAULT_AGENT_ID;
      const { WarpDashboardAdapter } = await import('./src/infrastructure/adapters/WarpDashboardAdapter.js');
      const { DashboardService } = await import('./src/domain/services/DashboardService.js');
      const { renderRoadmap, renderLineage, renderAll, renderInbox, renderSubmissions } = await import('./src/tui/render-status.js');

      const adapter = new WarpDashboardAdapter(process.cwd(), agentId);
      const service = new DashboardService(adapter);
      const raw = await service.getSnapshot();
      const snapshot = service.filterSnapshot(raw, { includeGraveyard: opts.includeGraveyard ?? false });

      const view = opts.view;
      const validViews = ['roadmap', 'lineage', 'all', 'inbox', 'submissions'];
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
      } else if (view === 'submissions') {
        console.log(renderSubmissions(snapshot));
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

await program.parseAsync(process.argv);
