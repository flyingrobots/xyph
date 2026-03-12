import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WarpGraphAdapter } from '../../src/infrastructure/adapters/WarpGraphAdapter.js';
import { createGraphContext } from '../../src/infrastructure/GraphContext.js';
import { createPatchSession } from '../../src/infrastructure/helpers/createPatchSession.js';

describe('GraphContext entity detail integration', () => {
  let repoPath: string;
  let graphPort: WarpGraphAdapter;

  beforeAll(() => {
    repoPath = path.join(os.tmpdir(), `xyph-show-test-${Date.now()}`);
    fs.mkdirSync(repoPath, { recursive: true });
    execSync('git init', { cwd: repoPath });
    execSync('git config user.email "test@xyph.dev"', { cwd: repoPath });
    execSync('git config user.name "Test Runner"', { cwd: repoPath });
    graphPort = new WarpGraphAdapter(repoPath, 'test-show-graph', 'test-writer');
  });

  afterAll(() => {
    if (repoPath) {
      fs.rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it('builds a quest detail projection with traceability and graph-native narrative', { timeout: 30_000 }, async () => {
    const graph = await graphPort.getGraph();

    await graph.patch((p) => {
      p.addNode('intent:SHOW')
        .setProperty('intent:SHOW', 'title', 'Quest detail test')
        .setProperty('intent:SHOW', 'requested_by', 'human.test')
        .setProperty('intent:SHOW', 'created_at', 1_700_100_000_000)
        .setProperty('intent:SHOW', 'type', 'intent');

      p.addNode('campaign:SHOW')
        .setProperty('campaign:SHOW', 'title', 'Quest detail campaign')
        .setProperty('campaign:SHOW', 'status', 'IN_PROGRESS')
        .setProperty('campaign:SHOW', 'type', 'campaign');

      p.addNode('task:SHOW-001')
        .setProperty('task:SHOW-001', 'title', 'Build quest detail projection')
        .setProperty('task:SHOW-001', 'status', 'READY')
        .setProperty('task:SHOW-001', 'hours', 5)
        .setProperty('task:SHOW-001', 'description', 'Issue-page detail view for quests.')
        .setProperty('task:SHOW-001', 'task_kind', 'delivery')
        .setProperty('task:SHOW-001', 'ready_by', 'human.test')
        .setProperty('task:SHOW-001', 'ready_at', 1_700_100_000_001)
        .setProperty('task:SHOW-001', 'type', 'task');

      p.addEdge('task:SHOW-001', 'intent:SHOW', 'authorized-by');
      p.addEdge('task:SHOW-001', 'campaign:SHOW', 'belongs-to');

      p.addNode('story:SHOW')
        .setProperty('story:SHOW', 'title', 'Quest detail page')
        .setProperty('story:SHOW', 'persona', 'Maintainer')
        .setProperty('story:SHOW', 'goal', 'inspect the full history of a quest')
        .setProperty('story:SHOW', 'benefit', 'coordination narrative stays queryable')
        .setProperty('story:SHOW', 'created_by', 'human.test')
        .setProperty('story:SHOW', 'created_at', 1_700_100_000_002)
        .setProperty('story:SHOW', 'type', 'story');
      p.addEdge('intent:SHOW', 'story:SHOW', 'decomposes-to');

      p.addNode('req:SHOW')
        .setProperty('req:SHOW', 'description', 'Quest detail must expose graph-native docs and comments')
        .setProperty('req:SHOW', 'kind', 'functional')
        .setProperty('req:SHOW', 'priority', 'must')
        .setProperty('req:SHOW', 'type', 'requirement');
      p.addEdge('story:SHOW', 'req:SHOW', 'decomposes-to');
      p.addEdge('task:SHOW-001', 'req:SHOW', 'implements');

      p.addNode('criterion:SHOW')
        .setProperty('criterion:SHOW', 'description', 'Quest detail shows current and historical note revisions')
        .setProperty('criterion:SHOW', 'verifiable', true)
        .setProperty('criterion:SHOW', 'type', 'criterion');
      p.addEdge('req:SHOW', 'criterion:SHOW', 'has-criterion');

      p.addNode('evidence:SHOW')
        .setProperty('evidence:SHOW', 'kind', 'test')
        .setProperty('evidence:SHOW', 'result', 'linked')
        .setProperty('evidence:SHOW', 'produced_at', 1_700_100_000_003)
        .setProperty('evidence:SHOW', 'produced_by', 'agent.scan')
        .setProperty('evidence:SHOW', 'type', 'evidence');
      p.addEdge('evidence:SHOW', 'criterion:SHOW', 'verifies');
    });

    const noteV1 = await createPatchSession(graph);
    noteV1
      .addNode('note:SHOW-v1')
      .setProperty('note:SHOW-v1', 'type', 'note')
      .setProperty('note:SHOW-v1', 'title', 'Quest detail draft')
      .setProperty('note:SHOW-v1', 'authored_by', 'human.test')
      .setProperty('note:SHOW-v1', 'authored_at', 1_700_100_000_004);
    await noteV1.attachContent('note:SHOW-v1', 'First draft of the quest detail design.');
    await noteV1.commit();

    const noteV2 = await createPatchSession(graph);
    noteV2
      .addNode('note:SHOW-v2')
      .setProperty('note:SHOW-v2', 'type', 'note')
      .setProperty('note:SHOW-v2', 'title', 'Quest detail draft')
      .setProperty('note:SHOW-v2', 'authored_by', 'human.test')
      .setProperty('note:SHOW-v2', 'authored_at', 1_700_100_000_005)
      .addEdge('note:SHOW-v2', 'task:SHOW-001', 'documents')
      .addEdge('note:SHOW-v2', 'note:SHOW-v1', 'supersedes');
    await noteV2.attachContent('note:SHOW-v2', 'Second draft with timeline and traceability coverage.');
    await noteV2.commit();

    const spec = await createPatchSession(graph);
    spec
      .addNode('spec:SHOW')
      .setProperty('spec:SHOW', 'type', 'spec')
      .setProperty('spec:SHOW', 'title', 'Quest detail contract')
      .setProperty('spec:SHOW', 'authored_by', 'human.test')
      .setProperty('spec:SHOW', 'authored_at', 1_700_100_000_006)
      .addEdge('spec:SHOW', 'req:SHOW', 'documents');
    await spec.attachContent('spec:SHOW', 'The quest detail payload should include docs, comments, and traceability.');
    await spec.commit();

    const comment = await createPatchSession(graph);
    comment
      .addNode('comment:SHOW-1')
      .setProperty('comment:SHOW-1', 'type', 'comment')
      .setProperty('comment:SHOW-1', 'authored_by', 'human.test')
      .setProperty('comment:SHOW-1', 'authored_at', 1_700_100_000_007)
      .addEdge('comment:SHOW-1', 'task:SHOW-001', 'comments-on');
    await comment.attachContent('comment:SHOW-1', 'Need a real issue-page view before web/TUI work.');
    await comment.commit();

    const reply = await createPatchSession(graph);
    reply
      .addNode('comment:SHOW-2')
      .setProperty('comment:SHOW-2', 'type', 'comment')
      .setProperty('comment:SHOW-2', 'authored_by', 'agent.codex')
      .setProperty('comment:SHOW-2', 'authored_at', 1_700_100_000_008)
      .addEdge('comment:SHOW-2', 'comment:SHOW-1', 'replies-to');
    await reply.attachContent('comment:SHOW-2', 'Agreed. The JSON shape should stabilize first.');
    await reply.commit();

    const ctx = createGraphContext(graphPort);
    const detail = await ctx.fetchEntityDetail('task:SHOW-001');

    expect(detail).not.toBeNull();
    expect(detail?.questDetail).toBeDefined();
    expect(detail?.type).toBe('task');
    expect(detail?.outgoing).toEqual(expect.arrayContaining([
      { nodeId: 'intent:SHOW', label: 'authorized-by' },
      { nodeId: 'campaign:SHOW', label: 'belongs-to' },
      { nodeId: 'req:SHOW', label: 'implements' },
    ]));

    const questDetail = detail?.questDetail;
    expect(questDetail).toBeDefined();
    if (!questDetail) {
      throw new Error('quest detail should be present for task:SHOW-001');
    }
    expect(questDetail.quest.status).toBe('READY');
    expect(questDetail.quest.taskKind).toBe('delivery');
    expect(questDetail.quest.computedCompletion).toMatchObject({
      tracked: true,
      complete: false,
      verdict: 'LINKED',
      discrepancy: undefined,
      requirementCount: 1,
      criterionCount: 1,
    });
    expect(questDetail.requirements.map((entry) => entry.id)).toEqual(['req:SHOW']);
    expect(questDetail.criteria.map((entry) => entry.id)).toEqual(['criterion:SHOW']);
    expect(questDetail.evidence.map((entry) => entry.id)).toEqual(['evidence:SHOW']);

    expect(questDetail.documents.map((entry) => entry.id)).toEqual([
      'note:SHOW-v1',
      'note:SHOW-v2',
      'spec:SHOW',
    ]);
    expect(questDetail.documents.find((entry) => entry.id === 'note:SHOW-v1')).toMatchObject({
      current: false,
      supersededByIds: ['note:SHOW-v2'],
      body: 'First draft of the quest detail design.',
    });
    expect(questDetail.documents.find((entry) => entry.id === 'note:SHOW-v2')).toMatchObject({
      current: true,
      supersedesId: 'note:SHOW-v1',
      body: 'Second draft with timeline and traceability coverage.',
      targetIds: ['task:SHOW-001'],
    });
    expect(questDetail.documents.find((entry) => entry.id === 'spec:SHOW')).toMatchObject({
      targetIds: ['req:SHOW'],
    });

    expect(questDetail.comments.map((entry) => entry.id)).toEqual(['comment:SHOW-1', 'comment:SHOW-2']);
    expect(questDetail.comments.find((entry) => entry.id === 'comment:SHOW-1')).toMatchObject({
      targetId: 'task:SHOW-001',
      replyIds: ['comment:SHOW-2'],
      body: 'Need a real issue-page view before web/TUI work.',
    });
    expect(questDetail.comments.find((entry) => entry.id === 'comment:SHOW-2')).toMatchObject({
      replyToId: 'comment:SHOW-1',
      body: 'Agreed. The JSON shape should stabilize first.',
    });

    expect(questDetail.timeline.map((entry) => entry.id)).toEqual(expect.arrayContaining([
      'task:SHOW-001:ready',
      'evidence:SHOW',
      'note:SHOW-v1',
      'note:SHOW-v2',
      'comment:SHOW-1',
      'comment:SHOW-2',
    ]));
  });
});
