import { describe, expect, it } from 'vitest';
import { createPlainStylePort, ensurePlainBijouContext } from '../../src/infrastructure/adapters/PlainStyleAdapter.js';
import { renderAll } from '../../src/tui/render-status.js';
import { makeSnapshot } from '../helpers/snapshot.js';
import { strip } from '../helpers/ansi.js';

ensurePlainBijouContext();

describe('renderAll', () => {
  it('renders the workflow census including submissions, reviews, and decisions', () => {
    const style = createPlainStylePort();
    const output = strip(renderAll(makeSnapshot({
      campaigns: [{ id: 'campaign:ALL', title: 'All campaign', status: 'IN_PROGRESS' }],
      intents: [{
        id: 'intent:ALL',
        title: 'All intent',
        requestedBy: 'human.test',
        createdAt: 1_700_000_000_000,
      }],
      quests: [{ id: 'task:ALL', title: 'All quest', status: 'READY', hours: 2 }],
      scrolls: [{
        id: 'artifact:ALL',
        questId: 'task:ALL',
        artifactHash: 'hash:all',
        sealedBy: 'agent.test',
        sealedAt: 1_700_000_000_001,
        hasSeal: true,
      }],
      approvals: [{
        id: 'approval:ALL',
        status: 'PENDING',
        trigger: 'CRITICAL_PATH_CHANGE',
        approver: 'human.ada',
        requestedBy: 'agent.test',
      }],
      submissions: [{
        id: 'submission:ALL',
        questId: 'task:ALL',
        status: 'OPEN',
        headsCount: 1,
        approvalCount: 0,
        submittedBy: 'agent.test',
        submittedAt: 1_700_000_000_002,
      }],
      reviews: [{
        id: 'review:ALL',
        patchsetId: 'patchset:ALL',
        verdict: 'approve',
        comment: 'Looks good',
        reviewedBy: 'human.ada',
        reviewedAt: 1_700_000_000_003,
      }],
      decisions: [{
        id: 'decision:ALL',
        submissionId: 'submission:ALL',
        kind: 'merge',
        decidedBy: 'human.ada',
        rationale: 'Ship it',
        decidedAt: 1_700_000_000_004,
      }],
    }), style));

    expect(output).toContain('Workflow Census');
    expect(output).toContain('Submissions');
    expect(output).toContain('Reviews');
    expect(output).toContain('Decisions');
    expect(output).toContain('submission:ALL');
    expect(output).toContain('review:ALL');
    expect(output).toContain('decision:ALL');
  });
});
