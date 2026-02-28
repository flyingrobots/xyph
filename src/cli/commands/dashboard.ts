import type { Command } from 'commander';
import type { CliContext } from '../context.js';
import { createErrorHandler } from '../errorHandler.js';
import { assertPrefix } from '../validators.js';

export function registerDashboardCommands(program: Command, ctx: CliContext): void {
  const withErrorHandler = createErrorHandler(ctx);

  program
    .command('depend <from> <to>')
    .description('Declare that <from> depends on <to> (both must be task: nodes)')
    .action(withErrorHandler(async (from: string, to: string) => {
      assertPrefix(from, 'task:', 'from');
      assertPrefix(to, 'task:', 'to');
      if (from === to) {
        throw new Error(`[SELF_DEPENDENCY] A task cannot depend on itself: ${from}`);
      }

      const graph = await ctx.graphPort.getGraph();

      const [fromExists, toExists] = await Promise.all([
        graph.hasNode(from),
        graph.hasNode(to),
      ]);
      if (!fromExists) throw new Error(`[NOT_FOUND] Task ${from} not found in the graph`);
      if (!toExists) throw new Error(`[NOT_FOUND] Task ${to} not found in the graph`);

      // Verify both nodes are actually tasks
      const [fromProps, toProps] = await Promise.all([
        graph.getNodeProps(from),
        graph.getNodeProps(to),
      ]);
      if (fromProps?.get('type') !== 'task') {
        throw new Error(`[TYPE_MISMATCH] ${from} exists but is not a task (type: ${String(fromProps?.get('type') ?? 'unknown')})`);
      }
      if (toProps?.get('type') !== 'task') {
        throw new Error(`[TYPE_MISMATCH] ${to} exists but is not a task (type: ${String(toProps?.get('type') ?? 'unknown')})`);
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
    .option('--view <name>', 'roadmap | lineage | all | inbox | submissions | deps', 'roadmap')
    .option('--include-graveyard', 'include GRAVEYARD tasks in output (excluded by default)')
    .action(withErrorHandler(async (opts: { view: string; includeGraveyard?: boolean }) => {
      const view = opts.view;
      const validViews = ['roadmap', 'lineage', 'all', 'inbox', 'submissions', 'deps'] as const;
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

          if (ctx.json) {
            const blockedByObj: Record<string, string[]> = {};
            for (const [k, v] of frontierResult.blockedBy) blockedByObj[k] = v;
            const tasksObj: Record<string, { title: string; status: string; hours: number }> = {};
            for (const [k, v] of tasks) tasksObj[k] = v;
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
            tasks,
            topBlockers,
          }));
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
            case 'lineage': ctx.print(renderLineage(snapshot)); break;
            case 'all': ctx.print(renderAll(snapshot)); break;
            case 'inbox': ctx.print(renderInbox(snapshot)); break;
            case 'submissions': ctx.print(renderSubmissions(snapshot)); break;
            default: ctx.print(renderRoadmap(snapshot)); break;
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
