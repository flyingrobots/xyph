import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WarpQuestReadAdapter } from '../../src/infrastructure/warp/optics/WarpQuestReadAdapter.js';
import { WarpGraphAdapter } from '../../src/infrastructure/adapters/WarpGraphAdapter.js';
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

describe('WarpQuestReadAdapter Integration', () => {
  let repoPath: string;
  const agentId = 'human.tester';
  let graphPort: WarpGraphAdapter;

  beforeAll(async () => {
    repoPath = path.join(os.tmpdir(), `xyph-quest-read-test-${Date.now()}`);
    fs.mkdirSync(repoPath, { recursive: true });
    execSync('git init', { cwd: repoPath });
    execSync('git config user.email "test@xyph.dev"', { cwd: repoPath });
    execSync('git config user.name "Test Runner"', { cwd: repoPath });

    graphPort = new WarpGraphAdapter(repoPath, 'xyph', agentId);
    const graph = await graphPort.getGraph();

    // Construct a complete quest-requirement-criterion-evidence hierarchy + governs policy
    await graph.patch((p) => {
      p.addNode('task:QUEST-1')
        .setProperty('task:QUEST-1', 'title', 'Optics Quest')
        .setProperty('task:QUEST-1', 'status', 'READY')
        .setProperty('task:QUEST-1', 'hours', 8)
        .setProperty('task:QUEST-1', 'type', 'task')
        .setProperty('task:QUEST-1', 'task_kind', 'feature')
        .addNode('req:REQ-1')
        .setProperty('req:REQ-1', 'description', 'Requirement One')
        .setProperty('req:REQ-1', 'kind', 'functional')
        .setProperty('req:REQ-1', 'priority', 'must')
        .addEdge('task:QUEST-1', 'req:REQ-1', 'implements')
        .addNode('criterion:CRIT-1')
        .setProperty('criterion:CRIT-1', 'description', 'Criterion One')
        .setProperty('criterion:CRIT-1', 'verifiable', true)
        .addEdge('req:REQ-1', 'criterion:CRIT-1', 'has-criterion')
        .addNode('evidence:EVID-1')
        .setProperty('evidence:EVID-1', 'kind', 'test')
        .setProperty('evidence:EVID-1', 'result', 'pass')
        .setProperty('evidence:EVID-1', 'produced_at', Date.now())
        .setProperty('evidence:EVID-1', 'produced_by', 'human.tester')
        .addEdge('evidence:EVID-1', 'criterion:CRIT-1', 'verifies')
        .addNode('campaign:CAMP-1')
        .setProperty('campaign:CAMP-1', 'type', 'campaign')
        .addEdge('task:QUEST-1', 'campaign:CAMP-1', 'belongs-to')
        .addNode('policy:POL-1')
        .setProperty('policy:POL-1', 'type', 'policy')
        .setProperty('policy:POL-1', 'coverage_threshold', 1.0)
        .addEdge('policy:POL-1', 'campaign:CAMP-1', 'governs');
    });
  });

  afterAll(() => {
    fs.rmSync(repoPath, { recursive: true, force: true });
  });

  it('can read the entire quest cone including nested requirements, criteria, evidence, and policies', async () => {
    const reader = new WarpQuestReadAdapter(graphPort, { accessorId: agentId, role: 'human' });
    const coneRes = await reader.getQuestCone('task:QUEST-1');

    expect(coneRes).not.toBeNull();
    if (!coneRes) return;
    const cone = coneRes.value;
    expect(cone.quest.id).toBe('task:QUEST-1');
    expect(cone.quest.title).toBe('Optics Quest');
    expect(cone.quest.status).toBe('READY');

    expect(cone.requirements).toHaveLength(1);
    const reqWrap = cone.requirements[0];
    expect(reqWrap.requirement.id).toBe('req:REQ-1');
    expect(reqWrap.requirement.description).toBe('Requirement One');

    expect(reqWrap.criteria).toHaveLength(1);
    const critWrap = reqWrap.criteria[0];
    expect(critWrap.criterion.id).toBe('criterion:CRIT-1');
    expect(critWrap.criterion.description).toBe('Criterion One');

    expect(critWrap.evidence).toHaveLength(1);
    expect(critWrap.evidence[0].id).toBe('evidence:EVID-1');
    expect(critWrap.evidence[0].kind).toBe('test');

    expect(cone.policies).toHaveLength(1);
    expect(cone.policies[0].id).toBe('policy:POL-1');
    expect(cone.policies[0].coverageThreshold).toBe(1.0);
  });
});
