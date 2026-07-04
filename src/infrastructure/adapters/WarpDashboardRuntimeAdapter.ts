import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { DashboardHealth, DashboardHealthIssue } from '../../domain/models/dashboard.js';
import { DoctorService } from '../../domain/services/DoctorService.js';
import type { DashboardRuntimePort } from '../../ports/DashboardRuntimePort.js';
import type { GraphPort } from '../../ports/GraphPort.js';
import { WarpRoadmapAdapter } from './WarpRoadmapAdapter.js';

function healthCategoryForBucket(bucket: string): DashboardHealthIssue['category'] {
  switch (bucket) {
    case 'dangling-edge':
    case 'orphan-node':
      return 'structural';
    case 'readiness-gap':
      return 'readiness';
    case 'governed-completion-gap':
    case 'sovereignty-violation':
      return 'governance';
    default:
      return 'workflow';
  }
}

export class WarpDashboardRuntimeAdapter implements DashboardRuntimePort {
  constructor(private readonly graphPort: GraphPort) {}

  public async loadHealth(): Promise<DashboardHealth | null> {
    const report = await new DoctorService(
      this.graphPort,
      new WarpRoadmapAdapter(this.graphPort, { syncOnQuery: false }),
    ).run();
    const issues = report.issues.map((issue): DashboardHealthIssue => ({
      severity: issue.severity,
      category: healthCategoryForBucket(issue.bucket),
      code: issue.code,
      nodeId: issue.nodeId,
      message: issue.message,
    }));
    return {
      status: report.status,
      blocking: report.blocking,
      summary: {
        issueCount: report.summary.issueCount,
        blockingIssueCount: report.summary.blockingIssueCount,
        readinessGaps: report.summary.readinessGaps,
        governedCompletionGaps: report.summary.governedCompletionGaps,
      },
      issues,
    };
  }

  public async sync(): Promise<void> {
    const graph = await this.graphPort.getGraph();
    if (typeof graph.syncCoverage !== 'function') return;

    await new Promise<void>((resolve, reject) => {
      const filename = fileURLToPath(import.meta.url);
      const ext = path.extname(filename);
      const workerPath = path.resolve(path.dirname(filename), '../../tui/bijou/syncWorker' + ext);
      const worker = new Worker(workerPath, {
        workerData: {
          cwd: process.cwd(),
          graphName: graph.graphName,
          writerId: graph.writerId,
        },
        execArgv: process.execArgv,
      });
      let settled = false;
      const settleResolve = (): void => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const settleReject = (error: Error): void => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      worker.on('message', (msg: unknown) => {
        if (typeof msg === 'object' && msg !== null && (msg as { status?: unknown }).status === 'done') {
          settleResolve();
          return;
        }
        const error = typeof msg === 'object' && msg !== null && typeof (msg as { error?: unknown }).error === 'string'
          ? (msg as { error: string }).error
          : 'Dashboard sync worker failed';
        settleReject(new Error(error));
      });
      worker.on('error', (error: unknown) => {
        settleReject(error instanceof Error ? error : new Error(String(error)));
      });
      worker.on('exit', (code) => {
        if (settled) return;
        settleReject(new Error(`Dashboard sync worker exited before completion with code ${code ?? 'unknown'}`));
      });
    });
  }

  public async watch(onChange: () => void): Promise<(() => void) | null> {
    const graph = await this.graphPort.getGraph();
    if (typeof graph.watch !== 'function') return null;
    const { unsubscribe } = graph.watch('*', {
      onChange,
      poll: 10000,
    });
    return unsubscribe;
  }

  public invalidate(): void {
    this.graphPort.reset();
  }
}
