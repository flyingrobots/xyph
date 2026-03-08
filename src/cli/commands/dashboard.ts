import type { Command } from 'commander';
import type { CliContext } from '../context.js';
import { createErrorHandler } from '../errorHandler.js';
import { assertPrefixOneOf, assertNodeExists } from '../validators.js';

export function registerDashboardCommands(program: Command, ctx: CliContext): void {
  const withErrorHandler = createErrorHandler(ctx);

  const DEPEND_PREFIXES = ['task:', 'campaign:', 'milestone:'] as const;
  const DEPEND_TYPES = new Set(['task', 'campaign', 'milestone']);

  program
    .command('depend <from> <to>')
    .description('Declare that <from> depends on <to> (task:, campaign:, or milestone: nodes)')
    .action(withErrorHandler(async (from: string, to: string) => {
      assertPrefixOneOf(from, DEPEND_PREFIXES, 'from');
      assertPrefixOneOf(to, DEPEND_PREFIXES, 'to');
      if (from === to) {
        throw new Error(`[SELF_DEPENDENCY] A node cannot depend on itself: ${from}`);
      }

      const graph = await ctx.graphPort.getGraph();

      await Promise.all([
        assertNodeExists(graph, from, 'Node'),
        assertNodeExists(graph, to, 'Node'),
      ]);

      // Verify both nodes have valid types for dependency edges
      const [fromProps, toProps] = await Promise.all([
        graph.getNodeProps(from),
        graph.getNodeProps(to),
      ]);
      const fromType = String(fromProps?.['type'] ?? 'unknown');
      const toType = String(toProps?.['type'] ?? 'unknown');
      if (!DEPEND_TYPES.has(fromType)) {
        throw new Error(`[TYPE_MISMATCH] ${from} exists but is not a task/campaign/milestone (type: ${fromType})`);
      }
      if (!DEPEND_TYPES.has(toType)) {
        throw new Error(`[TYPE_MISMATCH] ${to} exists but is not a task/campaign/milestone (type: ${toType})`);
      }

      // Cross-type family check: tasks form one family, campaigns/milestones form another
      const CAMPAIGN_FAMILY = new Set(['campaign', 'milestone']);
      const fromIsCampaign = CAMPAIGN_FAMILY.has(fromType);
      const toIsCampaign = CAMPAIGN_FAMILY.has(toType);
      if (fromIsCampaign !== toIsCampaign) {
        throw new Error(
          `[TYPE_MISMATCH] Cannot create cross-type dependency: ${from} (${fromType}) → ${to} (${toType}). ` +
          `Both nodes must be tasks, or both must be campaigns/milestones.`,
        );
      }

      // Cycle check
      const { reachable } = await graph.traverse.isReachable(to, from, { labelFilter: 'depends-on' });
      if (reachable) {
        throw new Error(`[CYCLE_DETECTED] Adding ${from} → ${to} would create a cycle (${to} already reaches ${from})`);
      }

      const patchSha = await graph.patch((p) => {
        p.addEdge(from, to, 'depends-on');
      });

      if (ctx.json) {
        ctx.jsonOut({
          success: true, command: 'depend',
          data: { from, to, patch: patchSha },
        });
        return;
      }

      ctx.ok(`[OK] ${from} now depends on ${to} (patch: ${patchSha.slice(0, 7)})`);
    }));

  program
    .command('status')
    .description('Show a snapshot of the WARP graph')
    .option('--view <name>', 'roadmap | lineage | all | inbox | submissions | deps | trace | suggestions', 'roadmap')
    .option('--include-graveyard', 'include GRAVEYARD tasks in output (excluded by default)')
    .action(withErrorHandler(async (opts: { view: string; includeGraveyard?: boolean }) => {
      const view = opts.view;
      const validViews = ['roadmap', 'lineage', 'all', 'inbox', 'submissions', 'deps', 'trace', 'suggestions'] as const;
      if (!validViews.includes(view as typeof validViews[number])) {
        return ctx.fail(`Unknown --view '${view}'. Valid options: ${validViews.join(', ')}`);
      }

      const { createGraphContext } = await import('../../infrastructure/GraphContext.js');
      const graphCtx = createGraphContext(ctx.graphPort);
      const raw = await graphCtx.fetchSnapshot();
      const snapshot = graphCtx.filterSnapshot(raw, { includeGraveyard: opts.includeGraveyard ?? false });

      switch (view) {
        case 'deps': {
          const { computeFrontier, computeCriticalPath, computeTopBlockers } = await import('../../domain/services/DepAnalysis.js');

          const taskSummaries = snapshot.quests.map((q) => ({ id: q.id, status: q.status, hours: q.hours }));
          const depEdges = snapshot.quests.flatMap((q) =>
            (q.dependsOn ?? []).map((to) => ({ from: q.id, to })),
          );
          const taskIds = snapshot.quests.map((q) => q.id);
          const { sorted } = await graphCtx.graph.traverse.topologicalSort(taskIds, {
            dir: 'in',
            labelFilter: 'depends-on',
          });

          const frontierResult = computeFrontier(taskSummaries, depEdges);
          const criticalResult = computeCriticalPath(sorted, taskSummaries, depEdges);

          const tasks = new Map<string, { title: string; status: string; hours: number }>();
          for (const q of snapshot.quests) {
            tasks.set(q.id, { title: q.title, status: q.status, hours: q.hours });
          }

          const topBlockers = computeTopBlockers(taskSummaries, depEdges, 10);

          // Milestone frontier: reuse computeFrontier with campaigns mapped to TaskSummary
          const campaignSummaries = snapshot.campaigns.map((c) => ({ id: c.id, status: c.status, hours: 0 }));
          const campaignDepEdges = snapshot.campaigns.flatMap((c) =>
            (c.dependsOn ?? []).map((to) => ({ from: c.id, to })),
          );
          const milestoneFrontierResult = computeFrontier(campaignSummaries, campaignDepEdges);

          const milestones = new Map<string, { title: string; status: string }>();
          for (const c of snapshot.campaigns) {
            milestones.set(c.id, { title: c.title, status: c.status });
          }

          if (ctx.json) {
            const blockedByObj: Record<string, string[]> = {};
            for (const [k, v] of frontierResult.blockedBy) blockedByObj[k] = v;
            const tasksObj: Record<string, { title: string; status: string; hours: number }> = {};
            for (const [k, v] of tasks) tasksObj[k] = v;
            const milestonesBlockedObj: Record<string, string[]> = {};
            for (const [k, v] of milestoneFrontierResult.blockedBy) milestonesBlockedObj[k] = v;
            const milestonesObj: Record<string, { title: string; status: string }> = {};
            for (const [k, v] of milestones) milestonesObj[k] = v;
            ctx.jsonOut({
              success: true, command: 'status',
              data: {
                view: 'deps',
                frontier: frontierResult.frontier,
                blockedBy: blockedByObj,
                executionOrder: sorted,
                criticalPath: criticalResult.path,
                criticalPathHours: criticalResult.totalHours,
                tasks: tasksObj,
                topBlockers,
                milestoneFrontier: milestoneFrontierResult.frontier,
                milestonesBlocked: milestonesBlockedObj,
                milestones: milestonesObj,
                milestoneExecutionOrder: snapshot.sortedCampaignIds,
              },
            });
            return;
          }

          const { renderDeps } = await import('../../tui/render-status.js');
          ctx.print(renderDeps({
            frontier: frontierResult.frontier,
            blockedBy: frontierResult.blockedBy,
            executionOrder: sorted,
            criticalPath: criticalResult.path,
            criticalPathHours: criticalResult.totalHours,
            quests: tasks,
            topBlockers,
            milestoneFrontier: milestoneFrontierResult.frontier,
            milestonesBlocked: milestoneFrontierResult.blockedBy,
            milestones,
            milestoneExecutionOrder: snapshot.sortedCampaignIds,
          }, ctx.style));
          break;
        }
        case 'trace': {
          const {
            computeUnmetRequirements,
            computeUntestedCriteria,
            computeCoverageRatio,
          } = await import('../../domain/services/TraceabilityAnalysis.js');

          const reqSummaries = snapshot.requirements.map((r) => ({
            id: r.id,
            criterionIds: r.criterionIds,
          }));
          const critSummaries = snapshot.criteria.map((c) => ({
            id: c.id,
            evidenceIds: c.evidenceIds,
          }));

          const unmetReqs = computeUnmetRequirements(reqSummaries, critSummaries);
          const untestedCriteria = computeUntestedCriteria(critSummaries);
          const coverage = computeCoverageRatio(critSummaries);

          if (ctx.json) {
            ctx.jsonOut({
              success: true, command: 'status',
              data: {
                view: 'trace',
                stories: snapshot.stories,
                requirements: snapshot.requirements,
                criteria: snapshot.criteria,
                evidence: snapshot.evidence,
                summary: {
                  stories: snapshot.stories.length,
                  requirements: snapshot.requirements.length,
                  criteria: snapshot.criteria.length,
                  evidenced: coverage.evidenced,
                  unevidenced: coverage.total - coverage.evidenced,
                  coverageRatio: coverage.ratio,
                },
                unmetRequirements: unmetReqs,
                untestedCriteria,
              },
            });
            return;
          }

          const { renderTrace } = await import('../../tui/render-status.js');
          ctx.print(renderTrace({
            stories: snapshot.stories,
            requirements: snapshot.requirements,
            criteria: snapshot.criteria,
            evidence: snapshot.evidence,
            unmetRequirements: unmetReqs,
            untestedCriteria,
            coverage,
          }, ctx.style));
          break;
        }

        case 'suggestions': {
          if (ctx.json) {
            ctx.jsonOut({
              success: true, command: 'status',
              data: {
                view: 'suggestions',
                suggestions: snapshot.suggestions,
                summary: {
                  total: snapshot.suggestions.length,
                  pending: snapshot.suggestions.filter((s) => s.status === 'PENDING').length,
                  accepted: snapshot.suggestions.filter((s) => s.status === 'ACCEPTED').length,
                  rejected: snapshot.suggestions.filter((s) => s.status === 'REJECTED').length,
                },
              },
            });
            return;
          }

          const { renderSuggestions } = await import('../../tui/render-status.js');
          ctx.print(renderSuggestions({ suggestions: snapshot.suggestions }, ctx.style));
          break;
        }

        default: {
          if (ctx.json) {
            ctx.jsonOut({
              success: true, command: 'status',
              data: { ...snapshot, view },
            });
            return;
          }

          const { renderRoadmap, renderLineage, renderAll, renderInbox, renderSubmissions } = await import('../../tui/render-status.js');

          switch (view) {
            case 'lineage': ctx.print(renderLineage(snapshot, ctx.style)); break;
            case 'all': ctx.print(renderAll(snapshot, ctx.style)); break;
            case 'inbox': ctx.print(renderInbox(snapshot, ctx.style)); break;
            case 'submissions': ctx.print(renderSubmissions(snapshot, ctx.style)); break;
            default: ctx.print(renderRoadmap(snapshot, ctx.style)); break;
          }
        }
      }
    }));

  program
    .command('audit-sovereignty')
    .description('Audit all BACKLOG quests for missing Genealogy of Intent (Constitution Art. IV)')
    .action(withErrorHandler(async () => {
      const { WarpRoadmapAdapter } = await import('../../infrastructure/adapters/WarpRoadmapAdapter.js');
      const { SovereigntyService } = await import('../../domain/services/SovereigntyService.js');

      const adapter = new WarpRoadmapAdapter(ctx.graphPort);
      const service = new SovereigntyService(adapter);

      const violations = await service.auditBacklog();

      if (ctx.json) {
        if (violations.length === 0) {
          ctx.jsonOut({
            success: true, command: 'audit-sovereignty',
            data: { valid: true, violations: [] },
          });
        } else {
          ctx.failWithData(
            `${violations.length} quest(s) lack sovereign intent ancestry`,
            { violations },
          );
        }
        return;
      }

      if (violations.length === 0) {
        ctx.ok('[OK] All BACKLOG quests have a valid Genealogy of Intent.');
      } else {
        ctx.fail(
          `\n[VIOLATION] ${violations.length} quest(s) lack sovereign intent ancestry:\n` +
          violations.map((v) => `  ✗ ${v.questId}\n    ${v.reason}`).join('\n') +
          `\n\n  Fix: xyph-actuator quest <id> --intent <intent:ID> ...`,
        );
      }
    }));
}
