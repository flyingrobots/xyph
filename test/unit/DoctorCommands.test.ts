import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import type { CliContext } from '../../src/cli/context.js';

const runDoctor = vi.fn();
const prescribeDoctor = vi.fn();
const doctorCtor = vi.fn();
const roadmapCtor = vi.fn();

vi.mock('../../src/domain/services/DoctorService.js', () => ({
  DoctorService: vi.fn().mockImplementation(function MockDoctorService(graphPort, roadmap) {
    doctorCtor(graphPort, roadmap);
    return {
      run: runDoctor,
      prescribe: prescribeDoctor,
    };
  }),
}));

vi.mock('../../src/infrastructure/adapters/WarpRoadmapAdapter.js', () => ({
  WarpRoadmapAdapter: vi.fn().mockImplementation(function MockWarpRoadmapAdapter(graphPort) {
    roadmapCtor(graphPort);
    return { mocked: true };
  }),
}));

import { registerDoctorCommands } from '../../src/cli/commands/doctor.js';

function makeCtx(json: boolean): CliContext {
  return {
    agentId: 'human.audit',
    identity: { agentId: 'human.audit', source: 'default', origin: null },
    json,
    graphPort: {} as CliContext['graphPort'],
    style: {} as CliContext['style'],
    ok: vi.fn(),
    warn: vi.fn(),
    muted: vi.fn(),
    print: vi.fn(),
    fail: vi.fn((msg: string) => {
      throw new Error(msg);
    }),
    failWithData: vi.fn(),
    jsonOut: vi.fn(),
  } as unknown as CliContext;
}

function registerDoctor(ctx: CliContext): Command {
  const program = new Command();
  registerDoctorCommands(program, ctx);
  return program;
}

describe('doctor command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('describes the graph health audit', () => {
    const program = registerDoctor(makeCtx(true));
    const cmd = program.commands.find((command) => command.name() === 'doctor');

    expect(cmd?.description()).toBe(
      'Audit graph health, structural integrity, and workflow gaps',
    );
  });

  it('emits the doctor report in JSON mode when only warnings are present', async () => {
    const report = {
      status: 'warn',
      healthy: false,
      blocking: false,
      asOf: 123,
      graphMeta: null,
      auditedStatuses: ['PLANNED', 'READY'],
      counts: {
        campaigns: 1,
        quests: 2,
        intents: 1,
        scrolls: 0,
        approvals: 0,
        submissions: 0,
        patchsets: 0,
        reviews: 0,
        decisions: 0,
        stories: 0,
        requirements: 0,
        criteria: 0,
        evidence: 0,
        policies: 0,
        suggestions: 0,
        documents: 0,
        comments: 0,
      },
      summary: {
        issueCount: 1,
        blockingIssueCount: 0,
        errorCount: 0,
        warningCount: 1,
        danglingEdges: 0,
        orphanNodes: 1,
        readinessGaps: 0,
        sovereigntyViolations: 0,
        governedCompletionGaps: 0,
      },
      issues: [
        {
          bucket: 'orphan-node',
          severity: 'warning',
          code: 'orphan-comment',
          message: 'comment:1 is not attached',
          nodeId: 'comment:1',
          relatedIds: [],
        },
      ],
      diagnostics: [
        {
          code: 'orphan-comment',
          severity: 'warning',
          category: 'structural',
          source: 'doctor',
          summary: 'comment:1 triggered orphan-comment',
          message: 'comment:1 is not attached',
          subjectId: 'comment:1',
          relatedIds: [],
          blocking: false,
        },
      ],
    };
    runDoctor.mockResolvedValueOnce(report);

    const ctx = makeCtx(true);
    const program = registerDoctor(ctx);

    await program.parseAsync(['doctor'], { from: 'user' });

    expect(roadmapCtor).toHaveBeenCalledWith(ctx.graphPort);
    expect(doctorCtor).toHaveBeenCalledWith(ctx.graphPort, { mocked: true });
    expect(ctx.jsonOut).toHaveBeenCalledWith({
      success: true,
      command: 'doctor',
      data: report,
      diagnostics: report.diagnostics,
    });
    expect(ctx.failWithData).not.toHaveBeenCalled();
  });

  it('reports blocking issues through the JSON error envelope', async () => {
    const report = {
      status: 'error',
      healthy: false,
      blocking: true,
      asOf: 123,
      graphMeta: null,
      auditedStatuses: ['PLANNED', 'READY'],
      counts: {
        campaigns: 1,
        quests: 1,
        intents: 0,
        scrolls: 0,
        approvals: 0,
        submissions: 0,
        patchsets: 0,
        reviews: 0,
        decisions: 0,
        stories: 0,
        requirements: 0,
        criteria: 0,
        evidence: 0,
        policies: 0,
        suggestions: 0,
        documents: 0,
        comments: 0,
      },
      summary: {
        issueCount: 2,
        blockingIssueCount: 2,
        errorCount: 2,
        warningCount: 0,
        danglingEdges: 1,
        orphanNodes: 1,
        readinessGaps: 0,
        sovereigntyViolations: 0,
        governedCompletionGaps: 0,
      },
      issues: [],
      diagnostics: [
        {
          code: 'dangling-outgoing-depends-on',
          severity: 'error',
          category: 'structural',
          source: 'doctor',
          summary: 'task:BAD triggered dangling-outgoing-depends-on',
          message: 'task:BAD has an outgoing depends-on edge to missing node task:NOPE',
          subjectId: 'task:BAD',
          relatedIds: ['task:NOPE'],
          blocking: true,
        },
      ],
    };
    runDoctor.mockResolvedValueOnce(report);

    const ctx = makeCtx(true);
    const program = registerDoctor(ctx);

    await program.parseAsync(['doctor'], { from: 'user' });

    expect(ctx.failWithData).toHaveBeenCalledWith(
      '2 blocking graph health issue(s) detected',
      report as unknown as Record<string, unknown>,
      report.diagnostics,
    );
    expect(ctx.jsonOut).not.toHaveBeenCalled();
  });

  it('emits deterministic prescriptions in JSON mode', async () => {
    const report = {
      status: 'warn',
      healthy: false,
      blocking: false,
      asOf: 123,
      graphMeta: null,
      auditedStatuses: ['PLANNED', 'READY'],
      counts: {
        campaigns: 1,
        quests: 1,
        intents: 0,
        scrolls: 0,
        approvals: 0,
        submissions: 0,
        patchsets: 0,
        reviews: 0,
        decisions: 0,
        stories: 0,
        requirements: 0,
        criteria: 0,
        evidence: 0,
        policies: 0,
        suggestions: 0,
        documents: 0,
        comments: 0,
      },
      summary: {
        issueCount: 1,
        blockingIssueCount: 0,
        errorCount: 0,
        warningCount: 1,
        danglingEdges: 0,
        orphanNodes: 0,
        readinessGaps: 1,
        sovereigntyViolations: 0,
        governedCompletionGaps: 0,
        topRemediationBuckets: [
          {
            key: 'workflow-gap:ready-contract',
            category: 'workflow-gap',
            count: 1,
            highestPriority: 'P1',
            materializableCount: 0,
          },
        ],
      },
      issues: [],
      prescriptions: [
        {
          dedupeKey: 'workflow-gap:ready-contract:task:RX-001',
          groupingKey: 'workflow-gap:ready-contract',
          category: 'workflow-gap',
          summary: 'task:RX-001 fails the readiness contract',
          suggestedAction: 'Backfill the quest packet and metadata until the READY contract is satisfied.',
          subjectId: 'task:RX-001',
          relatedIds: [],
          blockedTransitions: ['ready'],
          blockedTaskIds: ['task:RX-001'],
          basePriority: 'P3',
          effectivePriority: 'P1',
          materializable: false,
          sourceIssueCodes: ['quest-readiness-gap'],
        },
      ],
      diagnostics: [],
    };
    prescribeDoctor.mockResolvedValueOnce(report);

    const ctx = makeCtx(true);
    const program = registerDoctor(ctx);

    await program.parseAsync(['doctor', 'prescribe'], { from: 'user' });

    expect(ctx.jsonOut).toHaveBeenCalledWith({
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
    expect(runDoctor).not.toHaveBeenCalled();
  });
});
