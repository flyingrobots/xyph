import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WarpSubmissionAdapter } from '../../src/infrastructure/adapters/WarpSubmissionAdapter.js';
import { WarpSubmissionReadAdapter } from '../../src/infrastructure/warp/optics/WarpSubmissionReadAdapter.js';
import { WarpGraphAdapter } from '../../src/infrastructure/adapters/WarpGraphAdapter.js';
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

describe('WarpSubmissionReadAdapter Integration', () => {
  let repoPath: string;
  const agentId = 'human.tester';
  let graphPort: WarpGraphAdapter;

  beforeAll(async () => {
    repoPath = path.join(os.tmpdir(), `xyph-sub-read-test-${Date.now()}`);
    fs.mkdirSync(repoPath, { recursive: true });
    execSync('git init', { cwd: repoPath });
    execSync('git config user.email "test@xyph.dev"', { cwd: repoPath });
    execSync('git config user.name "Test Runner"', { cwd: repoPath });

    graphPort = new WarpGraphAdapter(repoPath, 'xyph', agentId);
    const graph = await graphPort.getGraph();

    await graph.patch((p) => {
      p.addNode('task:SUB-READ-001')
        .setProperty('task:SUB-READ-001', 'title', 'Submission read test quest')
        .setProperty('task:SUB-READ-001', 'status', 'IN_PROGRESS')
        .setProperty('task:SUB-READ-001', 'hours', 4)
        .setProperty('task:SUB-READ-001', 'type', 'task');
    });
  });

  afterAll(() => {
    fs.rmSync(repoPath, { recursive: true, force: true });
  });

  it('can read submission lane subgraphs via getSubmissionLaneCone', async () => {
    const writer = new WarpSubmissionAdapter(graphPort, agentId);
    const reader = new WarpSubmissionReadAdapter(graphPort, { accessorId: agentId, role: 'human' });

    // Ensure we get empty cone when there are no submissions
    const emptyCone = await reader.getSubmissionLaneCone('task:SUB-READ-001');
    expect(emptyCone).not.toBeNull();
    expect(emptyCone?.value.questId).toBe('task:SUB-READ-001');
    expect(emptyCone?.value.submissions).toHaveLength(0);

    // Write a submission
    await writer.submit({
      questId: 'task:SUB-READ-001',
      submissionId: 'submission:SUB-READ-001-S1',
      patchsetId: 'patchset:SUB-READ-001-S1:P1',
      patchset: {
        workspaceRef: 'feat/sub-read-001',
        description: 'First patchset',
      },
    });

    // Write a review
    await writer.review({
      patchsetId: 'patchset:SUB-READ-001-S1:P1',
      reviewId: 'review:SUB-READ-001-S1:P1:R1',
      verdict: 'approve',
      comment: 'LGTM!',
    });

    const cone = await reader.getSubmissionLaneCone('task:SUB-READ-001');
    expect(cone).not.toBeNull();
    expect(cone?.value.questId).toBe('task:SUB-READ-001');
    expect(cone?.value.submissions).toHaveLength(1);
    expect(cone?.value.submissions[0].id).toBe('submission:SUB-READ-001-S1');
    expect(cone?.value.submissions[0].patchsets).toHaveLength(1);
    expect(cone?.value.submissions[0].patchsets[0].id).toBe('patchset:SUB-READ-001-S1:P1');
    expect(cone?.value.patchsetDetails['patchset:SUB-READ-001-S1:P1'].workspaceRef).toBe('feat/sub-read-001');
    expect(cone?.value.patchsetDetails['patchset:SUB-READ-001-S1:P1'].reviews).toHaveLength(1);
    expect(cone?.value.patchsetDetails['patchset:SUB-READ-001-S1:P1'].reviews[0].verdict).toBe('approve');
  });
});
