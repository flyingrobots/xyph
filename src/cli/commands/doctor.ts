import type { Command } from 'commander';
import type { CliContext } from '../context.js';
import { createErrorHandler } from '../errorHandler.js';
import { DoctorService, type DoctorReport } from '../../domain/services/DoctorService.js';
import { WarpRoadmapAdapter } from '../../infrastructure/adapters/WarpRoadmapAdapter.js';

function renderDoctorReport(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push(`XYPH Doctor [${report.status.toUpperCase()}]`);
  lines.push(`As Of: ${new Date(report.asOf).toISOString()}`);

  if (report.graphMeta) {
    lines.push(`Graph: tick=${report.graphMeta.maxTick} writers=${report.graphMeta.writerCount} tip=${report.graphMeta.tipSha}`);
  }

  lines.push('');
  lines.push('Counts');
  lines.push(`  quests=${report.counts.quests} campaigns=${report.counts.campaigns} intents=${report.counts.intents}`);
  lines.push(`  submissions=${report.counts.submissions} patchsets=${report.counts.patchsets} reviews=${report.counts.reviews} decisions=${report.counts.decisions}`);
  lines.push(`  stories=${report.counts.stories} requirements=${report.counts.requirements} criteria=${report.counts.criteria} evidence=${report.counts.evidence} policies=${report.counts.policies}`);
  lines.push(`  scrolls=${report.counts.scrolls} docs=${report.counts.documents} comments=${report.counts.comments}`);

  lines.push('');
  lines.push('Summary');
  lines.push(`  issues=${report.summary.issueCount} errors=${report.summary.errorCount} warnings=${report.summary.warningCount}`);
  lines.push(`  danglingEdges=${report.summary.danglingEdges} orphanNodes=${report.summary.orphanNodes}`);
  lines.push(`  readinessGaps=${report.summary.readinessGaps} sovereigntyViolations=${report.summary.sovereigntyViolations} governedCompletionGaps=${report.summary.governedCompletionGaps}`);

  if (report.issues.length === 0) {
    lines.push('');
    lines.push('No issues found.');
    return lines.join('\n');
  }

  lines.push('');
  lines.push('Issues');
  for (const issue of report.issues) {
    const related = issue.relatedIds.length > 0
      ? ` [${issue.relatedIds.join(', ')}]`
      : '';
    lines.push(`  [${issue.severity.toUpperCase()}] ${issue.code}${issue.nodeId ? ` ${issue.nodeId}` : ''}${related}`);
    lines.push(`    ${issue.message}`);
  }

  return lines.join('\n');
}

export function registerDoctorCommands(program: Command, ctx: CliContext): void {
  const withErrorHandler = createErrorHandler(ctx);

  program
    .command('doctor')
    .description('Audit graph health, structural integrity, and workflow gaps')
    .action(withErrorHandler(async () => {
      const service = new DoctorService(
        ctx.graphPort,
        new WarpRoadmapAdapter(ctx.graphPort),
      );
      const report = await service.run();

      if (ctx.json) {
        if (report.blocking) {
          return ctx.failWithData(
            `${report.summary.errorCount} blocking graph health issue(s) detected`,
            report as unknown as Record<string, unknown>,
          );
        }
        ctx.jsonOut({
          success: true,
          command: 'doctor',
          data: report as unknown as Record<string, unknown>,
        });
        return;
      }

      const rendered = renderDoctorReport(report);
      if (report.blocking) {
        return ctx.fail(rendered);
      }
      if (!report.healthy) {
        ctx.warn(rendered);
        return;
      }
      ctx.ok(rendered);
    }));
}
