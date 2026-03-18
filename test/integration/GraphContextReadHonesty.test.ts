import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createGraphContext } from '../../src/infrastructure/GraphContext.js';
import { WarpGraphAdapter } from '../../src/infrastructure/adapters/WarpGraphAdapter.js';
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

describe('GraphContext read-path honesty and campaign derivation', () => {
  let repoPath: string;
  let graphPort: WarpGraphAdapter;
  const writerId = 'human.reader';

  beforeAll(async () => {
    repoPath = path.join(os.tmpdir(), `xyph-graph-context-${Date.now()}`);
    fs.mkdirSync(repoPath, { recursive: true });
    execSync('git init', { cwd: repoPath });
    execSync('git config user.email "test@xyph.dev"', { cwd: repoPath });
    execSync('git config user.name "Test Runner"', { cwd: repoPath });

    graphPort = new WarpGraphAdapter(repoPath, 'xyph', writerId);
    const graph = await graphPort.getGraph();

    await graph.patch((p) => {
      p.addNode('campaign:C-BACKLOG')
        .setProperty('campaign:C-BACKLOG', 'title', 'Backlog campaign')
        .setProperty('campaign:C-BACKLOG', 'status', 'DONE')
        .setProperty('campaign:C-BACKLOG', 'type', 'campaign')
        .addNode('campaign:C-INPROG')
        .setProperty('campaign:C-INPROG', 'title', 'In-progress campaign')
        .setProperty('campaign:C-INPROG', 'status', 'BACKLOG')
        .setProperty('campaign:C-INPROG', 'type', 'campaign')
        .addNode('campaign:C-DONE')
        .setProperty('campaign:C-DONE', 'title', 'Done campaign')
        .setProperty('campaign:C-DONE', 'status', 'BACKLOG')
        .setProperty('campaign:C-DONE', 'type', 'campaign')
        .addNode('campaign:C-UNKNOWN')
        .setProperty('campaign:C-UNKNOWN', 'title', 'Unknown campaign')
        .setProperty('campaign:C-UNKNOWN', 'status', 'DONE')
        .setProperty('campaign:C-UNKNOWN', 'type', 'campaign')
        .addNode('campaign:C-FALLBACK')
        .setProperty('campaign:C-FALLBACK', 'title', 'Fallback campaign')
        .setProperty('campaign:C-FALLBACK', 'status', 'DONE')
        .setProperty('campaign:C-FALLBACK', 'type', 'campaign')
        .addNode('task:T-BACKLOG-1')
        .setProperty('task:T-BACKLOG-1', 'title', 'Backlog task one')
        .setProperty('task:T-BACKLOG-1', 'status', 'BACKLOG')
        .setProperty('task:T-BACKLOG-1', 'hours', 1)
        .setProperty('task:T-BACKLOG-1', 'type', 'task')
        .addNode('task:T-BACKLOG-2')
        .setProperty('task:T-BACKLOG-2', 'title', 'Backlog task two')
        .setProperty('task:T-BACKLOG-2', 'status', 'PLANNED')
        .setProperty('task:T-BACKLOG-2', 'hours', 1)
        .setProperty('task:T-BACKLOG-2', 'type', 'task')
        .addNode('task:T-INPROG-1')
        .setProperty('task:T-INPROG-1', 'title', 'Mixed task done')
        .setProperty('task:T-INPROG-1', 'status', 'DONE')
        .setProperty('task:T-INPROG-1', 'hours', 1)
        .setProperty('task:T-INPROG-1', 'type', 'task')
        .addNode('task:T-INPROG-2')
        .setProperty('task:T-INPROG-2', 'title', 'Mixed task planned')
        .setProperty('task:T-INPROG-2', 'status', 'PLANNED')
        .setProperty('task:T-INPROG-2', 'hours', 1)
        .setProperty('task:T-INPROG-2', 'type', 'task')
        .addNode('task:T-DONE-1')
        .setProperty('task:T-DONE-1', 'title', 'Done task one')
        .setProperty('task:T-DONE-1', 'status', 'DONE')
        .setProperty('task:T-DONE-1', 'hours', 1)
        .setProperty('task:T-DONE-1', 'type', 'task')
        .addNode('task:T-DONE-2')
        .setProperty('task:T-DONE-2', 'title', 'Done task graveyard')
        .setProperty('task:T-DONE-2', 'status', 'GRAVEYARD')
        .setProperty('task:T-DONE-2', 'hours', 1)
        .setProperty('task:T-DONE-2', 'type', 'task')
        .addNode('task:T-UNKNOWN-1')
        .setProperty('task:T-UNKNOWN-1', 'title', 'Unknown task graveyard')
        .setProperty('task:T-UNKNOWN-1', 'status', 'GRAVEYARD')
        .setProperty('task:T-UNKNOWN-1', 'hours', 1)
        .setProperty('task:T-UNKNOWN-1', 'type', 'task')
        .addEdge('task:T-BACKLOG-1', 'campaign:C-BACKLOG', 'belongs-to')
        .addEdge('task:T-BACKLOG-2', 'campaign:C-BACKLOG', 'belongs-to')
        .addEdge('task:T-INPROG-1', 'campaign:C-INPROG', 'belongs-to')
        .addEdge('task:T-INPROG-2', 'campaign:C-INPROG', 'belongs-to')
        .addEdge('task:T-DONE-1', 'campaign:C-DONE', 'belongs-to')
        .addEdge('task:T-DONE-2', 'campaign:C-DONE', 'belongs-to')
        .addEdge('task:T-UNKNOWN-1', 'campaign:C-UNKNOWN', 'belongs-to');
    });
  });

  afterAll(() => {
    if (repoPath) {
      fs.rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it('fetchSnapshot does not create checkpoints or emit checkpoint warnings during reads', async () => {
    const graph = await graphPort.getGraph();
    const checkpointSpy = vi.spyOn(graph, 'createCheckpoint');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const ctx = createGraphContext(graphPort);

    try {
      const snapshot = await ctx.fetchSnapshot();
      expect(snapshot.graphMeta).toBeDefined();
      expect(snapshot.graphMeta?.maxTick).toBeGreaterThan(0);
      expect(snapshot.graphMeta?.writerCount).toBeGreaterThan(0);
      expect(snapshot.graphMeta?.tipSha).toBeTruthy();
      expect(checkpointSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      checkpointSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it('derives campaign status from member quests and preserves stored status only when no quests exist', async () => {
    const ctx = createGraphContext(graphPort);
    const snapshot = await ctx.fetchSnapshot();
    const campaignStatus = new Map(snapshot.campaigns.map((campaign) => [campaign.id, campaign.status]));

    expect(campaignStatus.get('campaign:C-BACKLOG')).toBe('BACKLOG');
    expect(campaignStatus.get('campaign:C-INPROG')).toBe('IN_PROGRESS');
    expect(campaignStatus.get('campaign:C-DONE')).toBe('DONE');
    expect(campaignStatus.get('campaign:C-UNKNOWN')).toBe('UNKNOWN');
    expect(campaignStatus.get('campaign:C-FALLBACK')).toBe('DONE');
  });
});
