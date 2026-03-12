import { InvalidArgumentError, type Command } from 'commander';
import type { CliContext } from '../context.js';
import { createErrorHandler } from '../errorHandler.js';
import { assertPrefix, assertMinLength, assertPrefixOneOf, assertNodeExists } from '../validators.js';
import { VALID_REQUIREMENT_KINDS, VALID_REQUIREMENT_PRIORITIES } from '../../domain/entities/Requirement.js';
import { VALID_EVIDENCE_KINDS, VALID_EVIDENCE_RESULTS } from '../../domain/entities/Evidence.js';
import {
  DEFAULT_POLICY_ALLOW_MANUAL_SEAL,
  DEFAULT_POLICY_COVERAGE_THRESHOLD,
  DEFAULT_POLICY_REQUIRE_ALL_CRITERIA,
  DEFAULT_POLICY_REQUIRE_EVIDENCE,
} from '../../domain/entities/Policy.js';

// ---------------------------------------------------------------------------
// Prefix validation helpers
// ---------------------------------------------------------------------------

const DECOMPOSE_FROM_PREFIXES = ['intent:', 'story:'] as const;
const DECOMPOSE_TO_PREFIXES = ['story:', 'req:'] as const;
const GOVERN_CAMPAIGN_PREFIXES = ['campaign:', 'milestone:'] as const;

function assertDecomposeFrom(value: string): void {
  assertPrefixOneOf(value, DECOMPOSE_FROM_PREFIXES, '<from>');
}

function assertDecomposeTo(value: string): void {
  assertPrefixOneOf(value, DECOMPOSE_TO_PREFIXES, '<to>');
}

function assertGovernCampaign(value: string): void {
  assertPrefixOneOf(value, GOVERN_CAMPAIGN_PREFIXES, '<campaign>');
}

function parseCoverageThreshold(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new InvalidArgumentError(`--coverage-threshold must be a number between 0 and 1. Got: '${value}'`);
  }
  return parsed;
}

export function registerTraceabilityCommands(program: Command, ctx: CliContext): void {
  const withErrorHandler = createErrorHandler(ctx);

  // --- story: create a user story node ---
  program
    .command('story <id>')
    .description('Create a user story node (story:*)')
    .requiredOption('--title <text>', 'Story title (min 5 chars)')
    .requiredOption('--persona <text>', 'Who is the user?')
    .requiredOption('--goal <text>', 'What does the user want to achieve?')
    .requiredOption('--benefit <text>', 'Why does the user want this?')
    .option('--intent <id>', 'Decompose from an intent (adds decomposes-to edge)')
    .action(withErrorHandler(async (id: string, opts: {
      title: string; persona: string; goal: string; benefit: string; intent?: string;
    }) => {
      assertPrefix(id, 'story:', 'Story ID');
      assertMinLength(opts.title, 5, '--title');

      if (opts.intent) {
        assertPrefix(opts.intent, 'intent:', '--intent');
      }

      const graph = await ctx.graphPort.getGraph();
      const now = Date.now();

      if (opts.intent) {
        await assertNodeExists(graph, opts.intent, 'Intent');
      }

      const sha = await graph.patch((p) => {
        p.addNode(id)
          .setProperty(id, 'title', opts.title)
          .setProperty(id, 'persona', opts.persona)
          .setProperty(id, 'goal', opts.goal)
          .setProperty(id, 'benefit', opts.benefit)
          .setProperty(id, 'created_by', ctx.agentId)
          .setProperty(id, 'created_at', now)
          .setProperty(id, 'type', 'story');

        if (opts.intent) {
          p.addEdge(opts.intent, id, 'decomposes-to');
        }
      });

      if (ctx.json) {
        ctx.jsonOut({
          success: true, command: 'story',
          data: {
            id, title: opts.title, persona: opts.persona,
            goal: opts.goal, benefit: opts.benefit,
            intent: opts.intent ?? null,
            createdBy: ctx.agentId, createdAt: now, patch: sha,
          },
        });
        return;
      }

      ctx.ok(`[OK] Story ${id} created. Patch: ${sha}`);
      ctx.muted(`  Title: ${opts.title}`);
    }));

  // --- requirement: create a requirement node ---
  program
    .command('requirement <id>')
    .description('Create a requirement node (req:*)')
    .requiredOption('--description <text>', 'Requirement description (min 5 chars)')
    .requiredOption('--kind <type>', `functional | non-functional`)
    .requiredOption('--priority <level>', `must | should | could | wont`)
    .option('--story <id>', 'Decompose from a story (adds decomposes-to edge)')
    .action(withErrorHandler(async (id: string, opts: {
      description: string; kind: string; priority: string; story?: string;
    }) => {
      assertPrefix(id, 'req:', 'Requirement ID');
      assertMinLength(opts.description, 5, '--description');

      if (!VALID_REQUIREMENT_KINDS.has(opts.kind)) {
        throw new Error(`--kind must be one of: ${[...VALID_REQUIREMENT_KINDS].join(', ')}. Got: '${opts.kind}'`);
      }
      if (!VALID_REQUIREMENT_PRIORITIES.has(opts.priority)) {
        throw new Error(`--priority must be one of: ${[...VALID_REQUIREMENT_PRIORITIES].join(', ')}. Got: '${opts.priority}'`);
      }

      if (opts.story) {
        assertPrefix(opts.story, 'story:', '--story');
      }

      const graph = await ctx.graphPort.getGraph();

      if (opts.story) {
        await assertNodeExists(graph, opts.story, 'Story');
      }

      const sha = await graph.patch((p) => {
        p.addNode(id)
          .setProperty(id, 'description', opts.description)
          .setProperty(id, 'kind', opts.kind)
          .setProperty(id, 'priority', opts.priority)
          .setProperty(id, 'type', 'requirement');

        if (opts.story) {
          p.addEdge(opts.story, id, 'decomposes-to');
        }
      });

      if (ctx.json) {
        ctx.jsonOut({
          success: true, command: 'requirement',
          data: {
            id, description: opts.description,
            kind: opts.kind, priority: opts.priority,
            story: opts.story ?? null, patch: sha,
          },
        });
        return;
      }

      ctx.ok(`[OK] Requirement ${id} created. Patch: ${sha}`);
      ctx.muted(`  ${opts.description}`);
    }));

  // --- criterion: create an acceptance criterion node ---
  program
    .command('criterion <id>')
    .description('Create an acceptance criterion node (criterion:*)')
    .requiredOption('--description <text>', 'Criterion description (min 5 chars)')
    .option('--requirement <id>', 'Attach to a requirement (adds has-criterion edge)')
    .option('--no-verifiable', 'Mark as not independently verifiable')
    .action(withErrorHandler(async (id: string, opts: {
      description: string; requirement?: string; verifiable: boolean;
    }) => {
      assertPrefix(id, 'criterion:', 'Criterion ID');
      assertMinLength(opts.description, 5, '--description');

      if (opts.requirement) {
        assertPrefix(opts.requirement, 'req:', '--requirement');
      }

      const graph = await ctx.graphPort.getGraph();

      if (opts.requirement) {
        await assertNodeExists(graph, opts.requirement, 'Requirement');
      }

      const sha = await graph.patch((p) => {
        p.addNode(id)
          .setProperty(id, 'description', opts.description)
          .setProperty(id, 'verifiable', opts.verifiable)
          .setProperty(id, 'type', 'criterion');

        if (opts.requirement) {
          p.addEdge(opts.requirement, id, 'has-criterion');
        }
      });

      if (ctx.json) {
        ctx.jsonOut({
          success: true, command: 'criterion',
          data: {
            id, description: opts.description,
            verifiable: opts.verifiable,
            requirement: opts.requirement ?? null, patch: sha,
          },
        });
        return;
      }

      ctx.ok(`[OK] Criterion ${id} created. Patch: ${sha}`);
      ctx.muted(`  ${opts.description}`);
    }));

  // --- evidence: create an evidence node ---
  program
    .command('evidence <id>')
    .description('Create an evidence node that verifies a criterion (evidence:*)')
    .requiredOption('--kind <type>', `test | benchmark | manual | screenshot`)
    .requiredOption('--result <outcome>', `pass | fail | linked`)
    .requiredOption('--criterion <id>', 'Criterion to verify (criterion:*)')
    .requiredOption('--produced-by <principal>', 'Who or what produced this evidence')
    .option('--artifact-hash <hash>', 'Content hash of the evidence artifact')
    .action(withErrorHandler(async (id: string, opts: {
      kind: string; result: string; criterion: string; producedBy: string; artifactHash?: string;
    }) => {
      assertPrefix(id, 'evidence:', 'Evidence ID');
      assertPrefix(opts.criterion, 'criterion:', '--criterion');

      if (!VALID_EVIDENCE_KINDS.has(opts.kind)) {
        throw new Error(`--kind must be one of: ${[...VALID_EVIDENCE_KINDS].join(', ')}. Got: '${opts.kind}'`);
      }
      if (!VALID_EVIDENCE_RESULTS.has(opts.result)) {
        throw new Error(`--result must be one of: ${[...VALID_EVIDENCE_RESULTS].join(', ')}. Got: '${opts.result}'`);
      }

      const graph = await ctx.graphPort.getGraph();

      await assertNodeExists(graph, opts.criterion, 'Criterion');

      const now = Date.now();

      const sha = await graph.patch((p) => {
        p.addNode(id)
          .setProperty(id, 'kind', opts.kind)
          .setProperty(id, 'result', opts.result)
          .setProperty(id, 'produced_at', now)
          .setProperty(id, 'produced_by', opts.producedBy)
          .setProperty(id, 'type', 'evidence');

        if (opts.artifactHash) {
          p.setProperty(id, 'artifact_hash', opts.artifactHash);
        }

        p.addEdge(id, opts.criterion, 'verifies');
      });

      if (ctx.json) {
        ctx.jsonOut({
          success: true, command: 'evidence',
          data: {
            id, kind: opts.kind, result: opts.result,
            criterion: opts.criterion, producedBy: opts.producedBy,
            producedAt: now, artifactHash: opts.artifactHash ?? null,
            patch: sha,
          },
        });
        return;
      }

      ctx.ok(`[OK] Evidence ${id} created → verifies ${opts.criterion}. Patch: ${sha}`);
    }));

  // --- policy: create a Definition of Done policy node ---
  program
    .command('policy <id>')
    .description('Create a Definition of Done policy node (policy:*)')
    .requiredOption('--campaign <id>', 'Campaign or milestone governed by this policy')
    .option(
      '--coverage-threshold <ratio>',
      'Minimum coverage ratio from 0.0 to 1.0',
      parseCoverageThreshold,
      DEFAULT_POLICY_COVERAGE_THRESHOLD,
    )
    .option('--no-require-all-criteria', 'Allow threshold-based completion without all criteria passing')
    .option('--no-require-evidence', 'Allow criteria without evidence to count toward future completion checks')
    .option('--allow-manual-seal', 'Permit future manual settlement override when policy is unmet')
    .action(withErrorHandler(async (id: string, opts: {
      campaign: string;
      coverageThreshold: number;
      requireAllCriteria: boolean;
      requireEvidence: boolean;
      allowManualSeal?: boolean;
    }) => {
      assertPrefix(id, 'policy:', 'Policy ID');
      assertGovernCampaign(opts.campaign);

      const graph = await ctx.graphPort.getGraph();
      await assertNodeExists(graph, opts.campaign, 'Campaign');

      const allowManualSeal = opts.allowManualSeal ?? DEFAULT_POLICY_ALLOW_MANUAL_SEAL;

      const sha = await graph.patch((p) => {
        p.addNode(id)
          .setProperty(id, 'coverage_threshold', opts.coverageThreshold)
          .setProperty(id, 'require_all_criteria', opts.requireAllCriteria ?? DEFAULT_POLICY_REQUIRE_ALL_CRITERIA)
          .setProperty(id, 'require_evidence', opts.requireEvidence ?? DEFAULT_POLICY_REQUIRE_EVIDENCE)
          .setProperty(id, 'allow_manual_seal', allowManualSeal)
          .setProperty(id, 'type', 'policy')
          .addEdge(id, opts.campaign, 'governs');
      });

      if (ctx.json) {
        ctx.jsonOut({
          success: true, command: 'policy',
          data: {
            id,
            campaign: opts.campaign,
            coverageThreshold: opts.coverageThreshold,
            requireAllCriteria: opts.requireAllCriteria ?? DEFAULT_POLICY_REQUIRE_ALL_CRITERIA,
            requireEvidence: opts.requireEvidence ?? DEFAULT_POLICY_REQUIRE_EVIDENCE,
            allowManualSeal,
            patch: sha,
          },
        });
        return;
      }

      ctx.ok(`[OK] Policy ${id} created → governs ${opts.campaign}. Patch: ${sha}`);
    }));

  // --- govern: attach an existing policy to a campaign ---
  program
    .command('govern <policy> <campaign>')
    .description('Attach an existing policy to a campaign or milestone (policy→campaign)')
    .action(withErrorHandler(async (policy: string, campaign: string) => {
      assertPrefix(policy, 'policy:', '<policy>');
      assertGovernCampaign(campaign);

      const graph = await ctx.graphPort.getGraph();
      await Promise.all([
        assertNodeExists(graph, policy, 'Policy'),
        assertNodeExists(graph, campaign, 'Campaign'),
      ]);

      const sha = await graph.patch((p) => {
        p.addEdge(policy, campaign, 'governs');
      });

      if (ctx.json) {
        ctx.jsonOut({
          success: true, command: 'govern',
          data: { policy, campaign, patch: sha },
        });
        return;
      }

      ctx.ok(`[OK] ${policy} now governs ${campaign} (patch: ${sha.slice(0, 7)})`);
    }));

  // --- decompose: add a decomposes-to edge ---
  program
    .command('decompose <from> <to>')
    .description('Declare that <from> decomposes into <to> (intent→story or story→req)')
    .action(withErrorHandler(async (from: string, to: string) => {
      assertDecomposeFrom(from);
      assertDecomposeTo(to);

      if (from === to) {
        throw new Error(`[SELF_DEPENDENCY] A node cannot decompose into itself: ${from}`);
      }

      // Validate prefix compatibility: intent→story or story→req
      if (from.startsWith('intent:') && !to.startsWith('story:')) {
        throw new Error(`[TYPE_MISMATCH] intent: nodes can only decompose to story: nodes. Got: '${to}'`);
      }
      if (from.startsWith('story:') && !to.startsWith('req:')) {
        throw new Error(`[TYPE_MISMATCH] story: nodes can only decompose to req: nodes. Got: '${to}'`);
      }

      const graph = await ctx.graphPort.getGraph();

      await Promise.all([
        assertNodeExists(graph, from, 'Node'),
        assertNodeExists(graph, to, 'Node'),
      ]);

      // Cycle check via reachability
      const { reachable } = await graph.traverse.isReachable(to, from, { labelFilter: 'decomposes-to' });
      if (reachable) {
        throw new Error(`[CYCLE_DETECTED] Adding ${from} → ${to} would create a cycle (${to} already reaches ${from})`);
      }

      const sha = await graph.patch((p) => {
        p.addEdge(from, to, 'decomposes-to');
      });

      if (ctx.json) {
        ctx.jsonOut({
          success: true, command: 'decompose',
          data: { from, to, patch: sha },
        });
        return;
      }

      ctx.ok(`[OK] ${from} decomposes into ${to} (patch: ${sha.slice(0, 7)})`);
    }));

  // --- scan: parse test annotations and write evidence ---
  program
    .command('scan')
    .description('Scan test files for @xyph criterion annotations and write evidence nodes')
    .option('--glob <pattern>', 'Glob pattern for test files', 'test/**/*.{ts,tsx}')
    .action(withErrorHandler(async (opts: { glob: string }) => {
      const { scanAnnotations } = await import('../../domain/services/TraceabilityScan.js');
      const { globSync } = await import('node:fs');

      const files = globSync(opts.glob, { cwd: process.cwd() });
      if (files.length === 0) {
        if (ctx.json) {
          ctx.jsonOut({
            success: true, command: 'scan',
            data: { filesScanned: 0, annotationsFound: 0, evidenceWritten: 0 },
          });
          return;
        }
        ctx.warn('[WARN] No files matched the glob pattern.');
        return;
      }

      const fs = await import('node:fs/promises');
      const allAnnotations: { criterionId: string; filePath: string; lineNumber: number }[] = [];

      for (const file of files) {
        const content = await fs.readFile(file, 'utf-8');
        const annotations = scanAnnotations(content, file);
        allAnnotations.push(...annotations);
      }

      if (allAnnotations.length === 0) {
        if (ctx.json) {
          ctx.jsonOut({
            success: true, command: 'scan',
            data: { filesScanned: files.length, annotationsFound: 0, evidenceWritten: 0 },
          });
          return;
        }
        ctx.muted(`Scanned ${files.length} files — no @xyph annotations found.`);
        return;
      }

      // Write evidence nodes for each unique criterion
      const graph = await ctx.graphPort.getGraph();
      const now = Date.now();
      let evidenceWritten = 0;

      // Group by criterion to avoid duplicate evidence nodes
      const byCriterion = new Map<string, { filePath: string; lineNumber: number }[]>();
      for (const ann of allAnnotations) {
        const arr = byCriterion.get(ann.criterionId) ?? [];
        arr.push({ filePath: ann.filePath, lineNumber: ann.lineNumber });
        byCriterion.set(ann.criterionId, arr);
      }

      // Validate all criteria exist, collect valid ones
      const validCriteria: [string, { filePath: string; lineNumber: number }[]][] = [];
      for (const [criterionId, locations] of byCriterion) {
        const criterionExists = await graph.hasNode(criterionId);
        if (!criterionExists) {
          if (!ctx.json) {
            ctx.warn(`  [SKIP] ${criterionId} — criterion node not found in graph`);
          }
          continue;
        }
        validCriteria.push([criterionId, locations]);
      }

      // Batch all evidence into a single patch
      if (validCriteria.length > 0) {
        await graph.patch((p) => {
          for (const [criterionId, locations] of validCriteria) {
            const evidenceId = `evidence:scan-${criterionId.replace('criterion:', '')}`;

            p.addNode(evidenceId)
              .setProperty(evidenceId, 'kind', 'test')
              .setProperty(evidenceId, 'result', 'linked')
              .setProperty(evidenceId, 'produced_at', now)
              .setProperty(evidenceId, 'produced_by', ctx.agentId)
              .setProperty(evidenceId, 'type', 'evidence')
              .setProperty(evidenceId, 'scan_locations', JSON.stringify(locations));

            p.addEdge(evidenceId, criterionId, 'verifies');
            evidenceWritten++;
          }
        });
      }

      if (!ctx.json) {
        for (const [criterionId, locations] of validCriteria) {
          const evidenceId = `evidence:scan-${criterionId.replace('criterion:', '')}`;
          ctx.muted(`  ${evidenceId} → ${criterionId} (${locations.length} location(s))`);
        }
      }

      if (ctx.json) {
        ctx.jsonOut({
          success: true, command: 'scan',
          data: {
            filesScanned: files.length,
            annotationsFound: allAnnotations.length,
            evidenceWritten,
            criteria: [...byCriterion.keys()],
          },
        });
        return;
      }

      ctx.ok(`[OK] Scanned ${files.length} files — ${allAnnotations.length} annotation(s), ${evidenceWritten} linked evidence node(s) written.`);
    }));
}
