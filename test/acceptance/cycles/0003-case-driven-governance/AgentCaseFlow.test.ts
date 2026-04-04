import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Command } from 'commander';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CliContext } from '../../../../src/cli/context.js';
import { registerAgentCommands } from '../../../../src/cli/commands/agent.js';
import { RecordService } from '../../../../src/domain/services/RecordService.js';
import { WarpObservationAdapter } from '../../../../src/infrastructure/adapters/WarpObservationAdapter.js';
import { WarpOperationalReadAdapter } from '../../../../src/infrastructure/adapters/WarpOperationalReadAdapter.js';
import { WarpSubstrateInspectionAdapter } from '../../../../src/infrastructure/adapters/WarpSubstrateInspectionAdapter.js';
import { WarpGraphAdapter } from '../../../../src/infrastructure/adapters/WarpGraphAdapter.js';
import { makeJsonCliContext } from '../../../helpers/cliContext.js';

describe('Cycle 0003: Case-Driven Governance', () => {
  let repoPath: string;
  let graphPort: WarpGraphAdapter;
  let records: RecordService;

  beforeEach(async () => {
    repoPath = path.join(
      os.tmpdir(),
      `xyph-acceptance-case-flow-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    fs.mkdirSync(repoPath, { recursive: true });
    execSync('git init', { cwd: repoPath, stdio: 'ignore' });
    execSync('git config user.email "test@xyph.dev"', { cwd: repoPath, stdio: 'ignore' });
    execSync('git config user.name "XYPH Acceptance"', { cwd: repoPath, stdio: 'ignore' });

    graphPort = new WarpGraphAdapter(repoPath, 'xyph', 'agent.tester');
    records = new RecordService(graphPort);

    const graph = await graphPort.getGraph();
    await graph.patch((p) => {
      p.addNode('task:TARGET')
        .setProperty('task:TARGET', 'type', 'task')
        .setProperty('task:TARGET', 'title', 'Traceability umbrella quest')
        .setProperty('task:TARGET', 'status', 'BACKLOG')
        .setProperty('task:TARGET', 'hours', 3)
        .addNode('campaign:TRACE')
        .setProperty('campaign:TRACE', 'type', 'campaign')
        .setProperty('campaign:TRACE', 'title', 'Traceability')
        .setProperty('campaign:TRACE', 'status', 'IN_PROGRESS');
    });

    await records.createAiSuggestion({
      id: 'suggestion:AI-TRACE',
      kind: 'quest',
      title: 'Split traceability into its own quest',
      summary: 'The current quest mixes delivery and traceability hardening.',
      suggestedBy: 'agent.oracle',
      audience: 'human',
      origin: 'spontaneous',
      targetId: 'task:TARGET',
      relatedIds: ['campaign:TRACE'],
      why: 'Repeated review fallout suggests this deserves explicit governed attention.',
      evidence: 'Recent review cycles keep surfacing traceability-specific follow-up.',
      nextAction: 'Open a governed case and gather recommendation briefs before changing the frontier.',
    });

    await seedOpenCase(graphPort);
  });

  afterEach(() => {
    fs.rmSync(repoPath, { recursive: true, force: true });
  });

  it('surfaces open governed cases in briefing and next for agents', async () => {
    const briefingCtx = makeCliContext(graphPort, repoPath);
    const briefingProgram = new Command();
    registerAgentCommands(briefingProgram, briefingCtx);

    await briefingProgram.parseAsync(['briefing'], { from: 'user' });

    expect(briefingCtx.jsonOut).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      command: 'briefing',
      data: expect.objectContaining({
        caseQueue: expect.arrayContaining([
          expect.objectContaining({
            caseId: 'case:TRACE-1',
            question: 'Should traceability become its own governed quest?',
            status: 'open',
            impact: 'frontier',
            risk: 'reversible-high',
            authority: 'human-decide-agent-apply',
            subjectIds: ['task:TARGET'],
            openedFromIds: ['suggestion:AI-TRACE'],
          }),
        ]),
      }),
    }));

    const nextCtx = makeCliContext(graphPort, repoPath);
    const nextProgram = new Command();
    registerAgentCommands(nextProgram, nextCtx);

    await nextProgram.parseAsync(['next', '--limit', '5'], { from: 'user' });

    expect(nextCtx.jsonOut).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      command: 'next',
      data: expect.objectContaining({
        candidates: expect.arrayContaining([
          expect.objectContaining({
            kind: 'brief',
            targetId: 'case:TRACE-1',
            allowed: true,
            requiresHumanApproval: false,
            underlyingCommand: 'xyph act brief case:TRACE-1',
          }),
        ]),
      }),
    }));
  });

  it('returns a full case packet from context case:*', async () => {
    const ctx = makeCliContext(graphPort, repoPath);
    const program = new Command();
    registerAgentCommands(program, ctx);

    await program.parseAsync(['context', 'case:TRACE-1'], { from: 'user' });

    expect(ctx.jsonOut).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      command: 'context',
      data: expect.objectContaining({
        id: 'case:TRACE-1',
        type: 'case',
        outgoing: expect.arrayContaining([
          { nodeId: 'task:TARGET', label: 'concerns' },
          { nodeId: 'suggestion:AI-TRACE', label: 'opened-from' },
        ]),
        incoming: expect.arrayContaining([
          { nodeId: 'brief:TRACE-ALT', label: 'briefs' },
        ]),
        agentContext: expect.objectContaining({
          caseContext: expect.objectContaining({
            caseId: 'case:TRACE-1',
            question: 'Should traceability become its own governed quest?',
            status: 'open',
            impact: 'frontier',
            risk: 'reversible-high',
            authority: 'human-decide-agent-apply',
            subjectIds: ['task:TARGET'],
            openedFromIds: ['suggestion:AI-TRACE'],
            briefIds: ['brief:TRACE-ALT'],
          }),
          semantics: expect.objectContaining({
            kind: 'case',
            expectedActor: 'agent',
            attentionState: 'ready',
          }),
          recommendedActions: expect.arrayContaining([
            expect.objectContaining({
              kind: 'brief',
              targetId: 'case:TRACE-1',
            }),
          ]),
        }),
      }),
    }));
  });

  it('validates and normalizes recommendation-brief preparation through the action kernel', async () => {
    const ctx = makeCliContext(graphPort, repoPath);
    const program = new Command();
    registerAgentCommands(program, ctx);

    await program.parseAsync([
      'act',
      'brief',
      'case:TRACE-1',
      '--dry-run',
      '--title',
      'Recommendation: split the traceability work',
      '--message',
      'Create a dedicated governed quest so the traceability work has explicit scope and evidence expectations.',
      '--rationale',
      'The current umbrella quest keeps mixing delivery and traceability hardening.',
      '--related',
      'task:TARGET',
      'suggestion:AI-TRACE',
    ], { from: 'user' });

    expect(ctx.jsonOut).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      command: 'act',
      data: expect.objectContaining({
        kind: 'brief',
        targetId: 'case:TRACE-1',
        result: 'dry-run',
        underlyingCommand: 'xyph act brief case:TRACE-1',
        validation: expect.objectContaining({
          valid: true,
          code: null,
          reasons: [],
        }),
        semantics: expect.objectContaining({
          kind: 'case',
          expectedActor: 'agent',
          attentionState: 'ready',
        }),
        details: expect.objectContaining({
          caseId: 'case:TRACE-1',
          briefKind: 'recommendation',
          subjectIds: ['task:TARGET'],
          relatedIds: ['task:TARGET', 'suggestion:AI-TRACE'],
        }),
      }),
    }));
  });
});

function makeCliContext(graphPort: WarpGraphAdapter, repoPath: string): CliContext {
  return makeJsonCliContext({
    agentId: 'agent.tester',
    cwd: repoPath,
    repoPath,
    graphName: 'xyph',
    identity: { agentId: 'agent.tester', source: 'default', origin: null },
    graphPort,
    observation: new WarpObservationAdapter(graphPort),
    operationalRead: new WarpOperationalReadAdapter(graphPort),
    inspection: new WarpSubstrateInspectionAdapter(graphPort),
  });
}

async function seedOpenCase(graphPort: WarpGraphAdapter): Promise<void> {
  const graph = await graphPort.getGraph();
  const now = Date.now();

  await graph.patch((p) => {
    p.addNode('case:TRACE-1')
      .setProperty('case:TRACE-1', 'type', 'case')
      .setProperty('case:TRACE-1', 'title', 'Should traceability become its own governed quest?')
      .setProperty('case:TRACE-1', 'question', 'Should traceability become its own governed quest?')
      .setProperty('case:TRACE-1', 'status', 'open')
      .setProperty('case:TRACE-1', 'impact', 'frontier')
      .setProperty('case:TRACE-1', 'risk', 'reversible-high')
      .setProperty('case:TRACE-1', 'authority', 'human-decide-agent-apply')
      .setProperty('case:TRACE-1', 'opened_by', 'human.james')
      .setProperty('case:TRACE-1', 'opened_at', now)
      .setProperty('case:TRACE-1', 'decision_question', 'Should traceability become its own governed quest?')
      .setProperty('case:TRACE-1', 'reason', 'Shape-changing case awaiting recommendation briefs.')
      .addEdge('case:TRACE-1', 'task:TARGET', 'concerns')
      .addEdge('case:TRACE-1', 'suggestion:AI-TRACE', 'opened-from')
      .addNode('brief:TRACE-ALT')
      .setProperty('brief:TRACE-ALT', 'type', 'brief')
      .setProperty('brief:TRACE-ALT', 'title', 'Alternative: keep the work inside the umbrella quest')
      .setProperty('brief:TRACE-ALT', 'brief_kind', 'alternative')
      .setProperty('brief:TRACE-ALT', 'summary', 'Keep the work inside task:TARGET until the next review cycle proves the split is necessary.')
      .setProperty('brief:TRACE-ALT', 'recommendation', 'Do not split yet; tighten traceability requirements on the current quest instead.')
      .setProperty('brief:TRACE-ALT', 'why_not', 'Splitting now may add governance overhead before evidence is complete.')
      .setProperty('brief:TRACE-ALT', 'authored_by', 'agent.other')
      .setProperty('brief:TRACE-ALT', 'authored_at', now - 1_000)
      .addEdge('brief:TRACE-ALT', 'case:TRACE-1', 'briefs');
  });
}
