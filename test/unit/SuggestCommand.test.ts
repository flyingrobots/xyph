import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import type { CliContext } from '../../src/cli/context.js';

const createAiSuggestion = vi.fn();

vi.mock('../../src/domain/services/RecordService.js', () => ({
  RecordService: class MockRecordService {
    createAiSuggestion = createAiSuggestion;
  },
}));

import { registerSuggestionCommands } from '../../src/cli/commands/suggestions.js';

function makeCtx(): CliContext {
  return {
    agentId: 'agent.trace',
    cwd: '/tmp/xyph',
    repoPath: '/tmp/xyph',
    graphName: 'xyph',
    identity: { agentId: 'agent.trace', source: 'default', origin: null },
    json: true,
    graphPort: {} as CliContext['graphPort'],
    style: {} as CliContext['style'],
    ok: vi.fn(),
    warn: vi.fn(),
    muted: vi.fn(),
    print: vi.fn(),
    fail: vi.fn((msg: string) => {
      throw new Error(msg);
    }),
    failWithData: vi.fn((msg: string) => {
      throw new Error(msg);
    }),
    jsonEvent: vi.fn(),
    jsonStart: vi.fn(),
    jsonProgress: vi.fn(),
    jsonOut: vi.fn(),
  } as unknown as CliContext;
}

describe('suggest command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAiSuggestion.mockResolvedValue({
      id: 'suggestion:S1',
      patch: 'patch:suggest-1',
      suggestedAt: 1_777_000_000_000,
      contentOid: 'oid:suggest-1',
    });
  });

  it('records a visible AI suggestion with derived request origin', async () => {
    const ctx = makeCtx();
    const program = new Command();
    registerSuggestionCommands(program, ctx);

    await program.parseAsync([
      'suggest',
      '--kind', 'dependency',
      '--title', 'Recommend a dependency edge',
      '--summary', 'This quest should probably depend on task:Q1 before it moves to READY.',
      '--for', 'agent',
      '--target', 'task:Q2',
      '--related', 'task:Q1', 'campaign:TRACE',
      '--requested-by', 'human.ada',
      '--why', 'The acceptance criteria rely on shared trace outputs.',
      '--evidence', 'Recent review comments point at missing upstream work.',
      '--next', 'Open the suggestion page and either comment or convert it into planned work.',
    ], { from: 'user' });

    expect(createAiSuggestion).toHaveBeenCalledWith({
      id: undefined,
      idempotencyKey: undefined,
      kind: 'dependency',
      title: 'Recommend a dependency edge',
      summary: 'This quest should probably depend on task:Q1 before it moves to READY.',
      suggestedBy: 'agent.trace',
      audience: 'agent',
      origin: 'request',
      status: 'suggested',
      targetId: 'task:Q2',
      relatedIds: ['task:Q1', 'campaign:TRACE'],
      requestedBy: 'human.ada',
      why: 'The acceptance criteria rely on shared trace outputs.',
      evidence: 'Recent review comments point at missing upstream work.',
      nextAction: 'Open the suggestion page and either comment or convert it into planned work.',
    });

    expect(ctx.jsonOut).toHaveBeenCalledWith({
      success: true,
      command: 'suggest',
      data: {
        id: 'suggestion:S1',
        kind: 'dependency',
        title: 'Recommend a dependency edge',
        summary: 'This quest should probably depend on task:Q1 before it moves to READY.',
        audience: 'agent',
        origin: 'request',
        status: 'suggested',
        targetId: 'task:Q2',
        relatedIds: ['task:Q1', 'campaign:TRACE'],
        requestedBy: 'human.ada',
        patch: 'patch:suggest-1',
        suggestedAt: 1_777_000_000_000,
        contentOid: 'oid:suggest-1',
      },
    });
  });

  it('queues an explicit ask-ai job for agent pickup', async () => {
    const ctx = makeCtx();
    const program = new Command();
    registerSuggestionCommands(program, ctx);

    await program.parseAsync([
      'ask-ai',
      '--title', 'Recommend backlog promotion',
      '--summary', 'Inspect task:Q2 and tell us whether it should move from BACKLOG to PLANNED next.',
      '--target', 'task:Q2',
      '--related', 'campaign:TRACE',
      '--why', 'The queue is getting crowded and we need a recommendation before planning.',
    ], { from: 'user' });

    expect(createAiSuggestion).toHaveBeenCalledWith({
      id: undefined,
      idempotencyKey: undefined,
      kind: 'ask-ai',
      title: 'Recommend backlog promotion',
      summary: 'Inspect task:Q2 and tell us whether it should move from BACKLOG to PLANNED next.',
      suggestedBy: 'agent.trace',
      audience: 'agent',
      origin: 'request',
      status: 'queued',
      targetId: 'task:Q2',
      relatedIds: ['campaign:TRACE'],
      requestedBy: 'agent.trace',
      why: 'The queue is getting crowded and we need a recommendation before planning.',
      evidence: undefined,
      nextAction: 'An agent should inspect this ask-AI job and publish one or more visible advisory suggestions in response.',
    });

    expect(ctx.jsonOut).toHaveBeenCalledWith({
      success: true,
      command: 'ask-ai',
      data: {
        id: 'suggestion:S1',
        kind: 'ask-ai',
        title: 'Recommend backlog promotion',
        summary: 'Inspect task:Q2 and tell us whether it should move from BACKLOG to PLANNED next.',
        audience: 'agent',
        origin: 'request',
        status: 'queued',
        targetId: 'task:Q2',
        relatedIds: ['campaign:TRACE'],
        requestedBy: 'agent.trace',
        patch: 'patch:suggest-1',
        suggestedAt: 1_777_000_000_000,
        contentOid: 'oid:suggest-1',
      },
    });
  });
});
