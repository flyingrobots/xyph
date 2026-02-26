#!/usr/bin/env -S npx tsx
import { randomUUID } from 'node:crypto';
import { program, InvalidArgumentError } from 'commander';
import { getTheme, styled } from './src/tui/theme/index.js';
import { WarpGraphAdapter } from './src/infrastructure/adapters/WarpGraphAdapter.js';

/**
 * XYPH Actuator - The "Hands" of the Causal Agent.
 * Exposes the git-warp Node.js API as a CLI for agentic mutations.
 */

const DEFAULT_AGENT_ID = 'agent.prime';
const agentId = process.env['XYPH_AGENT_ID'] ?? DEFAULT_AGENT_ID;
const graphPort = new WarpGraphAdapter(process.cwd(), 'xyph-roadmap', agentId);

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
      if (!id.startsWith('task:')) {
        console.error(styled(getTheme().theme.semantic.error, `[ERROR] Quest ID must start with 'task:' prefix, got: '${id}'`));
        process.exit(1);
      }
      if (!opts.intent) {
        console.error(styled(getTheme().theme.semantic.error,
          `[CONSTITUTION VIOLATION] Quest ${id} requires --intent <id> (Art. IV — Genealogy of Intent).\n` +
          `  Every Quest must trace its lineage to a sovereign human Intent.\n` +
          `  Declare one first: xyph-actuator intent <id> --title "..." --requested-by human.<name>`
        ));
        process.exit(1);
      }
      if (!opts.intent.startsWith('intent:')) {
        console.error(styled(getTheme().theme.semantic.error, `[ERROR] --intent value must start with 'intent:' prefix, got: '${opts.intent}'`));
        process.exit(1);
      }

      const graph = await graphPort.getGraph();
      const sha = await graph.patch((p) => {
        p.addNode(id)
          .setProperty(id, 'title', opts.title)
          .setProperty(id, 'status', 'BACKLOG')
          .setProperty(id, 'hours', opts.hours ?? 0)
          .setProperty(id, 'type', 'task');

        if (opts.campaign !== 'none') {
          p.addEdge(id, opts.campaign, 'belongs-to');
        }
        // opts.intent is guaranteed non-null by the guard above
        const intentId = opts.intent as string;
        p.addEdge(id, intentId, 'authorized-by');
      });

      const campaignNote = opts.campaign === 'none' ? '(no campaign)' : `in campaign ${opts.campaign}`;
      console.log(styled(getTheme().theme.semantic.success, `[OK] Quest ${id} initialized ${campaignNote}. Patch: ${sha}`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(styled(getTheme().theme.semantic.error, `[ERROR] ${msg}`));
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
        console.error(styled(getTheme().theme.semantic.error, `[ERROR] Intent ID must start with 'intent:' prefix, got: '${id}'`));
        process.exit(1);
      }
      if (!opts.requestedBy.startsWith('human.')) {
        console.error(styled(getTheme().theme.semantic.error,
          `[ERROR] --requested-by must identify a human principal (start with 'human.'), got: '${opts.requestedBy}'`
        ));
        process.exit(1);
      }
      if (opts.title.length < 5) {
        console.error(styled(getTheme().theme.semantic.error, `[ERROR] --title must be at least 5 characters`));
        process.exit(1);
      }

      const graph = await graphPort.getGraph();
      const now = Date.now();

      const sha = await graph.patch((p) => {
        p.addNode(id)
          .setProperty(id, 'title', opts.title)
          .setProperty(id, 'requested_by', opts.requestedBy)
          .setProperty(id, 'created_at', now)
          .setProperty(id, 'type', 'intent');

        if (opts.description) {
          p.setProperty(id, 'description', opts.description);
        }
      });

      console.log(styled(getTheme().theme.semantic.success, `[OK] Intent ${id} declared by ${opts.requestedBy}. Patch: ${sha}`));
      console.log(styled(getTheme().theme.semantic.muted, `  Title: ${opts.title}`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(styled(getTheme().theme.semantic.error, `[ERROR] ${msg}`));
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
      const graph = await graphPort.getGraph();

      console.log(styled(getTheme().theme.semantic.warning, `[*] Attempting to claim ${id} as ${agentId}...`));

      await graph.patch((p) => {
        p.setProperty(id, 'assigned_to', agentId)
          .setProperty(id, 'status', 'IN_PROGRESS')
          .setProperty(id, 'claimed_at', Date.now());
      });

      // Verify claim post-materialization (The OCP Verification Step)
      const props = await graph.getNodeProps(id);

      if (props && props.get('assigned_to') === agentId) {
        console.log(styled(getTheme().theme.semantic.success, `[OK] Claim confirmed. ${id} is yours.`));
      } else {
        const winner = props ? props.get('assigned_to') : 'unknown';
        console.log(styled(getTheme().theme.semantic.error, `[FAIL] Lost race condition for ${id}. Current owner: ${winner}`));
        process.exit(1);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(styled(getTheme().theme.semantic.error, `[ERROR] ${msg}`));
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
        const subAdapter = new WarpSubmissionAdapter(graphPort, agentId);
        const openSubs = await subAdapter.getOpenSubmissionsForQuest(id);
        if (openSubs.length > 0) {
          console.log(styled(getTheme().theme.semantic.warning,
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

      const graph = await graphPort.getGraph();
      const scrollId = `artifact:${id}`;

      const sha = await graph.patch((p) => {
        p.addNode(scrollId)
          .setProperty(scrollId, 'artifact_hash', opts.artifact)
          .setProperty(scrollId, 'rationale', opts.rationale)
          .setProperty(scrollId, 'type', 'scroll')
          .setProperty(scrollId, 'sealed_by', agentId)
          .setProperty(scrollId, 'sealed_at', now)
          .setProperty(scrollId, 'payload_digest', sealService.payloadDigest(scrollPayload))
          .addEdge(scrollId, id, 'fulfills');

        if (guildSeal) {
          p.setProperty(scrollId, 'guild_seal_alg', guildSeal.alg)
            .setProperty(scrollId, 'guild_seal_key_id', guildSeal.keyId)
            .setProperty(scrollId, 'guild_seal_sig', guildSeal.sig);
        }

        p.setProperty(id, 'status', 'DONE')
          .setProperty(id, 'completed_at', now);
      });

      if (guildSeal) {
        console.log(styled(getTheme().theme.semantic.muted, `  Guild Seal: ${guildSeal.keyId}`));
      } else {
        console.log(styled(getTheme().theme.semantic.warning, `  [WARN] No private key found for ${agentId} — scroll is unsigned. Run: xyph-actuator generate-key`));
      }

      console.log(styled(getTheme().theme.semantic.success, `[OK] Quest ${id} sealed. Scroll: ${scrollId}. Patch: ${sha}`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(styled(getTheme().theme.semantic.error, `[ERROR] ${msg}`));
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
      console.log(styled(getTheme().theme.semantic.success, `[OK] Keypair generated for agent ${agentId}`));
      console.log(styled(getTheme().theme.semantic.muted, `  Key ID:     ${keyId}`));
      console.log(styled(getTheme().theme.semantic.muted, `  Public key: ${publicKeyHex}`));
      console.log(styled(getTheme().theme.semantic.muted, `  Private key stored in trust/${agentId}.sk (gitignored)`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(styled(getTheme().theme.semantic.error, `[ERROR] ${msg}`));
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
        console.error(styled(getTheme().theme.semantic.error, '[ERROR] --description must be at least 10 characters'));
        process.exit(1);
      }

      const adapter = new WarpSubmissionAdapter(graphPort, agentId);
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

      console.log(styled(getTheme().theme.semantic.success, `[OK] Submission ${submissionId} created.`));
      console.log(styled(getTheme().theme.semantic.muted, `  Patchset:  ${patchsetId}`));
      console.log(styled(getTheme().theme.semantic.muted, `  Quest:     ${questId}`));
      console.log(styled(getTheme().theme.semantic.muted, `  Workspace: ${workspaceRef}`));
      console.log(styled(getTheme().theme.semantic.muted, `  Patch:     ${patchSha}`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(styled(getTheme().theme.semantic.error, `[ERROR] ${msg}`));
      process.exit(1);
    }
  });

program
  .command('revise <submission-id>')
  .description('Add a new patchset to an existing submission, superseding the current tip')
  .requiredOption('--description <text>', 'Description of the revision (min 10 chars)')
  .option('--workspace <ref>', 'Workspace reference (default: current git branch)')
  .option('--base <ref>', 'Base branch (default: main)', 'main')
  .action(async (submissionId: string, opts: { description: string; workspace?: string; base: string }) => {
    try {
      const agentId = process.env['XYPH_AGENT_ID'] ?? DEFAULT_AGENT_ID;
      const { WarpSubmissionAdapter } = await import('./src/infrastructure/adapters/WarpSubmissionAdapter.js');
      const { SubmissionService } = await import('./src/domain/services/SubmissionService.js');
      const { GitWorkspaceAdapter } = await import('./src/infrastructure/adapters/GitWorkspaceAdapter.js');
      const { computeTipPatchset } = await import('./src/domain/entities/Submission.js');

      if (opts.description.length < 10) {
        console.error(styled(getTheme().theme.semantic.error, '[ERROR] --description must be at least 10 characters'));
        process.exit(1);
      }

      const adapter = new WarpSubmissionAdapter(graphPort, agentId);
      const service = new SubmissionService(adapter);
      await service.validateRevise(submissionId, agentId);

      // Find the current tip to supersede
      const patchsetRefs = await adapter.getPatchsetRefs(submissionId);
      const { tip } = computeTipPatchset(patchsetRefs);
      if (!tip) {
        console.error(styled(getTheme().theme.semantic.error, `[ERROR] No existing patchsets found for ${submissionId}`));
        process.exit(1);
      }

      const workspace = new GitWorkspaceAdapter(process.cwd());
      const workspaceRef = opts.workspace ?? await workspace.getWorkspaceRef();
      let headRef: string | undefined;
      let commitShas: string[] | undefined;
      try {
        headRef = await workspace.getHeadCommit(workspaceRef);
        commitShas = await workspace.getCommitsSince(opts.base);
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
          baseRef: opts.base,
          headRef,
          commitShas,
          description: opts.description,
        },
      });

      console.log(styled(getTheme().theme.semantic.success, `[OK] Revision ${patchsetId} created.`));
      console.log(styled(getTheme().theme.semantic.muted, `  Supersedes: ${tip.id}`));
      console.log(styled(getTheme().theme.semantic.muted, `  Workspace:  ${workspaceRef}`));
      console.log(styled(getTheme().theme.semantic.muted, `  Patch:      ${patchSha}`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(styled(getTheme().theme.semantic.error, `[ERROR] ${msg}`));
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
        console.error(styled(getTheme().theme.semantic.error,
          `[ERROR] --verdict must be one of: ${validVerdicts.join(', ')}. Got: '${opts.verdict}'`
        ));
        process.exit(1);
      }

      const adapter = new WarpSubmissionAdapter(graphPort, agentId);
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

      console.log(styled(getTheme().theme.semantic.success, `[OK] Review ${reviewId} posted.`));
      console.log(styled(getTheme().theme.semantic.muted, `  Verdict:  ${verdict}`));
      console.log(styled(getTheme().theme.semantic.muted, `  Patchset: ${patchsetId}`));
      console.log(styled(getTheme().theme.semantic.muted, `  Patch:    ${patchSha}`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(styled(getTheme().theme.semantic.error, `[ERROR] ${msg}`));
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

      const adapter = new WarpSubmissionAdapter(graphPort, agentId);
      const service = new SubmissionService(adapter);
      const { tipPatchsetId } = await service.validateMerge(submissionId, agentId, opts.patchset);

      // Get workspace ref from the tip patchset via the adapter (no second graph instance)
      const workspaceRef = await adapter.getPatchsetWorkspaceRef(tipPatchsetId);
      if (typeof workspaceRef !== 'string') {
        console.error(styled(getTheme().theme.semantic.error, `[ERROR] Could not resolve workspace ref from patchset ${tipPatchsetId}`));
        process.exit(1);
      }

      // Git settlement
      const workspace = new GitWorkspaceAdapter(process.cwd());
      let mergeCommit: string | undefined;
      const alreadyMerged = await workspace.isMerged(workspaceRef, opts.into);
      if (alreadyMerged) {
        mergeCommit = await workspace.getHeadCommit(opts.into);
        if (!mergeCommit) {
          console.error(styled(getTheme().theme.semantic.error, `[ERROR] Could not resolve HEAD of ${opts.into}`));
          process.exit(1);
        }
        console.log(styled(getTheme().theme.semantic.muted, `  Branch ${workspaceRef} already merged into ${opts.into}`));
      } else {
        mergeCommit = await workspace.merge(workspaceRef, opts.into);
        console.log(styled(getTheme().theme.semantic.muted, `  Merged ${workspaceRef} into ${opts.into}: ${mergeCommit.slice(0, 7)}`));
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
        // Check if quest is already DONE (avoid duplicate sealing)
        const questStatus = await adapter.getQuestStatus(questId);
        if (questStatus === 'DONE') {
          console.log(styled(getTheme().theme.semantic.warning, `[WARN] Quest ${questId} is already DONE — skipping auto-seal.`));
        } else {
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

          // Same graph instance — decide() patch is already visible via _onPatchCommitted
          const sealGraph = await graphPort.getGraph();
          const scrollId = `artifact:${questId}`;

          await sealGraph.patch((p) => {
            p.addNode(scrollId)
              .setProperty(scrollId, 'artifact_hash', mergeCommit ?? 'unknown')
              .setProperty(scrollId, 'rationale', opts.rationale)
              .setProperty(scrollId, 'type', 'scroll')
              .setProperty(scrollId, 'sealed_by', agentId)
              .setProperty(scrollId, 'sealed_at', now)
              .setProperty(scrollId, 'payload_digest', sealService.payloadDigest(scrollPayload))
              .addEdge(scrollId, questId, 'fulfills');

            if (guildSeal) {
              p.setProperty(scrollId, 'guild_seal_alg', guildSeal.alg)
                .setProperty(scrollId, 'guild_seal_key_id', guildSeal.keyId)
                .setProperty(scrollId, 'guild_seal_sig', guildSeal.sig);
            }

            p.setProperty(questId, 'status', 'DONE')
              .setProperty(questId, 'completed_at', now);
          });

          console.log(styled(getTheme().theme.semantic.success, `[OK] Quest ${questId} auto-sealed via merge.`));
          if (guildSeal) {
            console.log(styled(getTheme().theme.semantic.muted, `  Guild Seal: ${guildSeal.keyId}`));
          }
        }
      }

      console.log(styled(getTheme().theme.semantic.success, `[OK] Submission ${submissionId} merged.`));
      console.log(styled(getTheme().theme.semantic.muted, `  Decision: ${decisionId}`));
      console.log(styled(getTheme().theme.semantic.muted, `  Patch:    ${patchSha}`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(styled(getTheme().theme.semantic.error, `[ERROR] ${msg}`));
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

      const adapter = new WarpSubmissionAdapter(graphPort, agentId);
      const service = new SubmissionService(adapter);
      await service.validateClose(submissionId, agentId);

      const decisionId = `decision:${generateId()}`;
      const { patchSha } = await adapter.decide({
        submissionId,
        decisionId,
        kind: 'close',
        rationale: opts.rationale,
      });

      console.log(styled(getTheme().theme.semantic.success, `[OK] Submission ${submissionId} closed.`));
      console.log(styled(getTheme().theme.semantic.muted, `  Decision:  ${decisionId}`));
      console.log(styled(getTheme().theme.semantic.muted, `  Rationale: ${opts.rationale}`));
      console.log(styled(getTheme().theme.semantic.muted, `  Patch:     ${patchSha}`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(styled(getTheme().theme.semantic.error, `[ERROR] ${msg}`));
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
        console.error(styled(getTheme().theme.semantic.error, `[ERROR] Task ID must start with 'task:', got: '${id}'`));
        process.exit(1);
      }
      if (opts.title.length < 5) {
        console.error(styled(getTheme().theme.semantic.error, `[ERROR] --title must be at least 5 characters`));
        process.exit(1);
      }
      if (!opts.suggestedBy.startsWith('human.') && !opts.suggestedBy.startsWith('agent.')) {
        console.error(styled(getTheme().theme.semantic.error,
          `[ERROR] --suggested-by must start with 'human.' or 'agent.', got: '${opts.suggestedBy}'`
        ));
        process.exit(1);
      }

      const graph = await graphPort.getGraph();
      const now = Date.now();

      const sha = await graph.patch((p) => {
        p.addNode(id)
          .setProperty(id, 'title', opts.title)
          .setProperty(id, 'status', 'INBOX')
          .setProperty(id, 'hours', opts.hours ?? 0)
          .setProperty(id, 'type', 'task')
          .setProperty(id, 'suggested_by', opts.suggestedBy)
          .setProperty(id, 'suggested_at', now);
      });

      console.log(styled(getTheme().theme.semantic.success, `[OK] Task ${id} added to INBOX.`));
      console.log(styled(getTheme().theme.semantic.muted, `  Suggested by: ${opts.suggestedBy}`));
      console.log(styled(getTheme().theme.semantic.muted, `  Patch: ${sha}`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(styled(getTheme().theme.semantic.error, `[ERROR] ${msg}`));
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

      const intake = new WarpIntakeAdapter(graphPort, agentId);
      const sha = await intake.promote(id, opts.intent, opts.campaign);

      console.log(styled(getTheme().theme.semantic.success, `[OK] Task ${id} promoted to BACKLOG.`));
      console.log(styled(getTheme().theme.semantic.muted, `  Intent:   ${opts.intent}`));
      if (opts.campaign !== undefined) console.log(styled(getTheme().theme.semantic.muted, `  Campaign: ${opts.campaign}`));
      console.log(styled(getTheme().theme.semantic.muted, `  Patch: ${sha}`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(styled(getTheme().theme.semantic.error, `[ERROR] ${msg}`));
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

      const intake = new WarpIntakeAdapter(graphPort, agentId);
      const sha = await intake.reject(id, opts.rationale);

      console.log(styled(getTheme().theme.semantic.success, `[OK] Task ${id} moved to GRAVEYARD.`));
      console.log(styled(getTheme().theme.semantic.muted, `  Rejected by: ${agentId}`));
      console.log(styled(getTheme().theme.semantic.muted, `  Rationale:   ${opts.rationale}`));
      console.log(styled(getTheme().theme.semantic.muted, `  Patch: ${sha}`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(styled(getTheme().theme.semantic.error, `[ERROR] ${msg}`));
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

      const intake = new WarpIntakeAdapter(graphPort, agentId);
      const sha = await intake.reopen(id);

      console.log(styled(getTheme().theme.semantic.success, `[OK] Task ${id} reopened to INBOX.`));
      console.log(styled(getTheme().theme.semantic.muted, `  Reopened by: ${agentId}`));
      console.log(styled(getTheme().theme.semantic.muted, `  Note: rejection history preserved in graph.`));
      console.log(styled(getTheme().theme.semantic.muted, `  Patch: ${sha}`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(styled(getTheme().theme.semantic.error, `[ERROR] ${msg}`));
      process.exit(1);
    }
  });

// --- DASHBOARD COMMANDS ---

program
  .command('depend <from> <to>')
  .description('Declare that <from> depends on <to> (both must be task: nodes)')
  .action(async (from: string, to: string) => {
    try {
      if (!from.startsWith('task:')) {
        throw new Error(`[MISSING_ARG] from must start with 'task:', got: '${from}'`);
      }
      if (!to.startsWith('task:')) {
        throw new Error(`[MISSING_ARG] to must start with 'task:', got: '${to}'`);
      }
      if (from === to) {
        throw new Error(`[SELF_DEPENDENCY] A task cannot depend on itself: ${from}`);
      }

      const graph = await graphPort.getGraph();

      const [fromExists, toExists] = await Promise.all([
        graph.hasNode(from),
        graph.hasNode(to),
      ]);
      if (!fromExists) throw new Error(`[NOT_FOUND] Task ${from} not found in the graph`);
      if (!toExists) throw new Error(`[NOT_FOUND] Task ${to} not found in the graph`);

      // Cycle check: if `to` can already reach `from`, adding from→to closes a cycle
      const { reachable } = await graph.traverse.isReachable(to, from, { labelFilter: 'depends-on' });
      if (reachable) {
        throw new Error(`[CYCLE_DETECTED] Adding ${from} → ${to} would create a cycle (${to} already reaches ${from})`);
      }

      const patchSha = await graph.patch((p) => {
        p.addEdge(from, to, 'depends-on');
      });
      console.log(styled(getTheme().theme.semantic.success, `[OK] ${from} now depends on ${to} (patch: ${patchSha.slice(0, 7)})`));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(styled(getTheme().theme.semantic.error, `[ERROR] ${msg}`));
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show a snapshot of the WARP graph')
  .option('--view <name>', 'roadmap | lineage | all | inbox | submissions | deps', 'roadmap')
  .option('--include-graveyard', 'include GRAVEYARD tasks in output (excluded by default)')
  .action(async (opts: { view: string; includeGraveyard?: boolean }) => {
    try {
      const view = opts.view;
      const validViews = ['roadmap', 'lineage', 'all', 'inbox', 'submissions', 'deps'];
      if (!validViews.includes(view)) {
        console.error(styled(getTheme().theme.semantic.error, `[ERROR] Unknown --view '${view}'. Valid options: ${validViews.join(', ')}`));
        process.exit(1);
      }

      const { createGraphContext } = await import('./src/infrastructure/GraphContext.js');
      const ctx = createGraphContext(graphPort);
      const raw = await ctx.fetchSnapshot();
      const snapshot = ctx.filterSnapshot(raw, { includeGraveyard: opts.includeGraveyard ?? false });

      if (view === 'deps') {
        const { computeFrontier, computeCriticalPath } = await import('./src/domain/services/DepAnalysis.js');
        const { renderDeps } = await import('./src/tui/render-status.js');

        const taskSummaries = snapshot.quests.map((q) => ({ id: q.id, status: q.status, hours: q.hours }));
        const depEdges = snapshot.quests.flatMap((q) =>
          (q.dependsOn ?? []).map((to) => ({ from: q.id, to })),
        );
        const taskIds = snapshot.quests.map((q) => q.id);
        const { sorted } = await ctx.graph.traverse.topologicalSort(taskIds, {
          labelFilter: 'depends-on',
        });

        const frontierResult = computeFrontier(taskSummaries, depEdges);
        const criticalResult = computeCriticalPath(sorted, taskSummaries, depEdges);

        const tasks = new Map<string, { title: string; status: string; hours: number }>();
        for (const q of snapshot.quests) {
          tasks.set(q.id, { title: q.title, status: q.status, hours: q.hours });
        }

        console.log(renderDeps({
          frontier: frontierResult.frontier,
          blockedBy: frontierResult.blockedBy,
          executionOrder: sorted,
          criticalPath: criticalResult.path,
          criticalPathHours: criticalResult.totalHours,
          tasks,
        }));
      } else {
        const { renderRoadmap, renderLineage, renderAll, renderInbox, renderSubmissions } = await import('./src/tui/render-status.js');

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
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(styled(getTheme().theme.semantic.error, `[ERROR] ${msg}`));
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

      const adapter = new WarpRoadmapAdapter(graphPort);
      const service = new SovereigntyService(adapter);

      const violations = await service.auditBacklog();

      if (violations.length === 0) {
        console.log(styled(getTheme().theme.semantic.success, '[OK] All BACKLOG quests have a valid Genealogy of Intent.'));
      } else {
        console.log(styled(getTheme().theme.semantic.error, `\n[VIOLATION] ${violations.length} quest(s) lack sovereign intent ancestry:\n`));
        for (const v of violations) {
          console.log(styled(getTheme().theme.semantic.error, `  ✗ ${v.questId}`));
          console.log(styled(getTheme().theme.semantic.muted, `    ${v.reason}`));
        }
        console.log(styled(getTheme().theme.semantic.muted, `\n  Fix: xyph-actuator quest <id> --intent <intent:ID> ...`));
        process.exit(1);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(styled(getTheme().theme.semantic.error, `[ERROR] ${msg}`));
      process.exit(1);
    }
  });

await program.parseAsync(process.argv);
