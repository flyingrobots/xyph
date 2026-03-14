import type { Command } from 'commander';
import type { CliContext } from '../context.js';
import { createErrorHandler } from '../errorHandler.js';
import {
  DoctorService,
  type DoctorProgress,
  type DoctorPrescription,
  type DoctorReport,
} from '../../domain/services/DoctorService.js';
import { WarpRoadmapAdapter } from '../../infrastructure/adapters/WarpRoadmapAdapter.js';
import { renderDiagnosticsLines } from '../renderDiagnostics.js';

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
  lines.push(`  issues=${report.summary.issueCount} blocking=${report.summary.blockingIssueCount} errors=${report.summary.errorCount} warnings=${report.summary.warningCount}`);
  lines.push(`  danglingEdges=${report.summary.danglingEdges} orphanNodes=${report.summary.orphanNodes}`);
  lines.push(`  readinessGaps=${report.summary.readinessGaps} sovereigntyViolations=${report.summary.sovereigntyViolations} governedCompletionGaps=${report.summary.governedCompletionGaps}`);
  if (report.summary.topRemediationBuckets.length > 0) {
    lines.push(`  topRemediationBuckets=${report.summary.topRemediationBuckets.map((bucket) => `${bucket.key}:${bucket.count}@${bucket.highestPriority}`).join(', ')}`);
  }

  if (report.diagnostics.length === 0) {
    lines.push('');
    lines.push('No issues found.');
    return lines.join('\n');
  }

  lines.push(...renderDiagnosticsLines(report.diagnostics));

  return lines.join('\n');
}

function renderPrescriptions(
  prescriptions: DoctorPrescription[],
  report: DoctorReport,
): string {
  const lines: string[] = [];
  lines.push('XYPH Doctor Prescriptions');
  lines.push(`As Of: ${new Date(report.asOf).toISOString()}`);

  if (report.graphMeta) {
    lines.push(`Graph: tick=${report.graphMeta.maxTick} writers=${report.graphMeta.writerCount} tip=${report.graphMeta.tipSha}`);
  }

  lines.push('');
  lines.push('Summary');
  lines.push(`  prescriptions=${prescriptions.length} blockingIssues=${report.summary.blockingIssueCount}`);
  lines.push(`  topBuckets=${report.summary.topRemediationBuckets.length}`);

  if (report.summary.topRemediationBuckets.length > 0) {
    lines.push('');
    lines.push('Top Buckets');
    for (const bucket of report.summary.topRemediationBuckets) {
      lines.push(`  - ${bucket.key} count=${bucket.count} highest=${bucket.highestPriority} materializable=${bucket.materializableCount}`);
    }
  }

  if (prescriptions.length === 0) {
    lines.push('');
    lines.push('No prescriptions generated.');
    return lines.join('\n');
  }

  lines.push('');
  lines.push('Prescriptions');
  for (const prescription of prescriptions) {
    lines.push(`  - ${prescription.effectivePriority} ${prescription.category} ${prescription.subjectId ?? prescription.dedupeKey}`);
    lines.push(`      ${prescription.summary}`);
    lines.push(`      action: ${prescription.suggestedAction}`);
    if (prescription.blockedTransitions.length > 0) {
      lines.push(`      blocks: ${prescription.blockedTransitions.join(', ')}`);
    }
    if (prescription.blockedTaskIds.length > 0) {
      lines.push(`      tasks: ${prescription.blockedTaskIds.join(', ')}`);
    }
    lines.push(`      materializable: ${prescription.materializable ? 'yes' : 'no'}  dedupe: ${prescription.dedupeKey}`);
  }

  return lines.join('\n');
}

export function registerDoctorCommands(program: Command, ctx: CliContext): void {
  const withErrorHandler = createErrorHandler(ctx);

  const emitDoctorProgress = (command: string) => (progress: DoctorProgress): void => {
    ctx.jsonProgress(command, progress.message, {
      stage: progress.stage,
      ...(progress.data ?? {}),
    });
  };

  const doctorCmd = program
    .command('doctor')
    .description('Audit graph health, structural integrity, and workflow gaps')
    ;

  doctorCmd
    .command('prescribe')
    .description('Derive deterministic remediation prescriptions from doctor findings')
    .action(withErrorHandler(async () => {
      const service = new DoctorService(
        ctx.graphPort,
        new WarpRoadmapAdapter(ctx.graphPort),
      );
      if (ctx.json) ctx.jsonStart('doctor prescribe');
      const report = await service.prescribe({
        onProgress: ctx.json ? emitDoctorProgress('doctor prescribe') : undefined,
      });

      if (ctx.json) {
        ctx.jsonOut({
          success: true,
          command: 'doctor prescribe',
          data: {
            asOf: report.asOf,
            graphMeta: report.graphMeta,
            summary: report.summary,
            prescriptions: report.prescriptions,
          },
          diagnostics: report.diagnostics,
        });
        return;
      }

      const rendered = renderPrescriptions(report.prescriptions, report);
      if (report.blocking) {
        ctx.warn(rendered);
        return;
      }
      if (!report.healthy) {
        ctx.warn(rendered);
        return;
      }
      ctx.ok(rendered);
    }));

  doctorCmd
    .action(withErrorHandler(async () => {
      const service = new DoctorService(
        ctx.graphPort,
        new WarpRoadmapAdapter(ctx.graphPort),
      );
      if (ctx.json) ctx.jsonStart('doctor');
      const report = await service.run({
        onProgress: ctx.json ? emitDoctorProgress('doctor') : undefined,
      });

      if (ctx.json) {
        if (report.blocking) {
          return ctx.failWithData(
            `${report.summary.errorCount} blocking graph health issue(s) detected`,
            report as unknown as Record<string, unknown>,
            report.diagnostics,
          );
        }
        ctx.jsonOut({
          success: true,
          command: 'doctor',
          data: report as unknown as Record<string, unknown>,
          diagnostics: report.diagnostics,
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
