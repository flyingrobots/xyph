import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CliContext } from '../../src/cli/context.js';
import { registerShowCommands } from '../../src/cli/commands/show.js';

const mocks = vi.hoisted(() => ({
  createPatchSession: vi.fn(),
  createGraphContext: vi.fn(),
  WarpRoadmapAdapter: vi.fn(),
  readinessAssess: vi.fn(),
}));

vi.mock('../../src/infrastructure/helpers/createPatchSession.js', () => ({
  createPatchSession: (graph: unknown) => mocks.createPatchSession(graph),
}));

vi.mock('../../src/infrastructure/GraphContext.js', () => ({
  createGraphContext: (graphPort: unknown) => mocks.createGraphContext(graphPort),
}));

vi.mock('../../src/infrastructure/adapters/WarpRoadmapAdapter.js', () => ({
  WarpRoadmapAdapter: function WarpRoadmapAdapter(graphPort: unknown) {
    mocks.WarpRoadmapAdapter(graphPort);
  },
}));

vi.mock('../../src/domain/services/ReadinessService.js', () => ({
  ReadinessService: class ReadinessService {
    assess(questId: string) {
      return mocks.readinessAssess(questId);
    }
  },
}));

function makePatchSession() {
  return {
    addNode: vi.fn().mockReturnThis(),
    setProperty: vi.fn().mockReturnThis(),
    addEdge: vi.fn().mockReturnThis(),
    attachContent: vi.fn(async () => undefined),
    commit: vi.fn(async () => 'patch:narrative'),
  };
}

function makeCtx(graph: {
  hasNode: (id: string) => Promise<boolean>;
  getContentOid?: (id: string) => Promise<string | null>;
}): CliContext {
  return {
    agentId: 'human.architect',
    identity: { agentId: 'human.architect', source: 'default', origin: null },
    json: true,
    graphPort: {
      getGraph: async () => graph,
    } as CliContext['graphPort'],
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
    jsonOut: vi.fn(),
  } as unknown as CliContext;
}

describe('show and narrative commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readinessAssess.mockResolvedValue({
      valid: true,
      questId: 'task:Q-001',
      taskKind: 'delivery',
      unmet: [],
    });
  });

  it('comment writes an append-only content-backed node', async () => {
    const graph = {
      hasNode: vi.fn().mockResolvedValue(true),
      getContentOid: vi.fn().mockResolvedValue('oid:comment'),
    };
    const patch = makePatchSession();
    mocks.createPatchSession.mockResolvedValue(patch);

    const ctx = makeCtx(graph);
    const program = new Command();
    registerShowCommands(program, ctx);

    await program.parseAsync(
      ['comment', 'comment:Q-001', '--on', 'task:Q-001', '--message', 'Need acceptance criteria first.'],
      { from: 'user' },
    );

    expect(graph.hasNode).toHaveBeenCalledWith('task:Q-001');
    expect(patch.addNode).toHaveBeenCalledWith('comment:Q-001');
    expect(patch.setProperty).toHaveBeenCalledWith('comment:Q-001', 'type', 'comment');
    expect(patch.setProperty).toHaveBeenCalledWith('comment:Q-001', 'authored_by', 'human.architect');
    expect(patch.addEdge).toHaveBeenCalledWith('comment:Q-001', 'task:Q-001', 'comments-on');
    expect(patch.attachContent).toHaveBeenCalledWith('comment:Q-001', 'Need acceptance criteria first.');
    expect(ctx.jsonOut).toHaveBeenCalledWith({
      success: true,
      command: 'comment',
      data: {
        id: 'comment:Q-001',
        on: 'task:Q-001',
        replyTo: null,
        authoredBy: 'human.architect',
        authoredAt: expect.any(Number),
        contentOid: 'oid:comment',
        patch: 'patch:narrative',
      },
    });
  });

  it('note writes graph-native content and revision lineage', async () => {
    const graph = {
      hasNode: vi.fn().mockResolvedValue(true),
      getContentOid: vi.fn().mockResolvedValue('oid:note'),
    };
    const patch = makePatchSession();
    mocks.createPatchSession.mockResolvedValue(patch);

    const ctx = makeCtx(graph);
    const program = new Command();
    registerShowCommands(program, ctx);

    await program.parseAsync(
      [
        'note',
        'note:Q-001-v2',
        '--on',
        'task:Q-001',
        '--title',
        'Readiness packet',
        '--body',
        'Capture the minimum readiness packet and open questions.',
        '--supersedes',
        'note:Q-001-v1',
      ],
      { from: 'user' },
    );

    expect(graph.hasNode).toHaveBeenNthCalledWith(1, 'task:Q-001');
    expect(graph.hasNode).toHaveBeenNthCalledWith(2, 'note:Q-001-v1');
    expect(patch.setProperty).toHaveBeenCalledWith('note:Q-001-v2', 'type', 'note');
    expect(patch.setProperty).toHaveBeenCalledWith('note:Q-001-v2', 'title', 'Readiness packet');
    expect(patch.addEdge).toHaveBeenCalledWith('note:Q-001-v2', 'task:Q-001', 'documents');
    expect(patch.addEdge).toHaveBeenCalledWith('note:Q-001-v2', 'note:Q-001-v1', 'supersedes');
    expect(patch.attachContent).toHaveBeenCalledWith(
      'note:Q-001-v2',
      'Capture the minimum readiness packet and open questions.',
    );
  });

  it('show emits a quest detail payload in JSON mode', async () => {
    const ctx = makeCtx({
      hasNode: vi.fn().mockResolvedValue(true),
    });
    const detail = {
      id: 'task:Q-001',
      type: 'task',
      props: { type: 'task', title: 'Quest detail' },
      content: null,
      contentOid: null,
      outgoing: [{ nodeId: 'campaign:CORE', label: 'belongs-to' }],
      incoming: [],
      questDetail: {
        id: 'task:Q-001',
        quest: {
          id: 'task:Q-001',
          title: 'Quest detail',
          status: 'READY',
          hours: 3,
          taskKind: 'delivery',
        },
        reviews: [],
        decisions: [],
        stories: [],
        requirements: [],
        criteria: [],
        evidence: [],
        policies: [],
        documents: [],
        comments: [],
        timeline: [],
      },
    };
    mocks.createGraphContext.mockReturnValue({
      fetchEntityDetail: vi.fn().mockResolvedValue(detail),
    });

    const program = new Command();
    registerShowCommands(program, ctx);

    await program.parseAsync(['show', 'task:Q-001'], { from: 'user' });

    expect(ctx.jsonOut).toHaveBeenCalledWith({
      success: true,
      command: 'show',
      data: {
        id: 'task:Q-001',
        type: 'task',
        props: { type: 'task', title: 'Quest detail' },
        content: null,
        contentOid: null,
        outgoing: [{ nodeId: 'campaign:CORE', label: 'belongs-to' }],
        incoming: [],
        questDetail: detail.questDetail,
        readiness: {
          valid: true,
          questId: 'task:Q-001',
          taskKind: 'delivery',
          unmet: [],
        },
      },
    });
  });
});
