import { describe, it, expect } from 'vitest';
import { readReviewLaneData } from '../../src/domain/services/ReviewLaneReadService.js';
import { makeSnapshot, quest, submission, decision } from '../helpers/snapshot.js';
import { makeObservationSessionDouble } from '../helpers/observation.js';

describe('ReviewLaneReadService', () => {
  it('filters out merged and closed submissions from the review lane data', async () => {
    // 1. Create a mock graph snapshot containing submissions of different status values
    const q1 = quest({ id: 'task:Q1', title: 'Quest 1 (Open)' });
    const q2 = quest({ id: 'task:Q2', title: 'Quest 2 (Merged)' });
    const q3 = quest({ id: 'task:Q3', title: 'Quest 3 (Closed)' });
    const q4 = quest({ id: 'task:Q4', title: 'Quest 4 (Changes Requested)' });
    const q5 = quest({ id: 'task:Q5', title: 'Quest 5 (Approved)' });

    const sub1 = submission({ id: 'submission:S1', questId: 'task:Q1', status: 'OPEN' });
    const sub2 = submission({ id: 'submission:S2', questId: 'task:Q2', status: 'MERGED' });
    const sub3 = submission({ id: 'submission:S3', questId: 'task:Q3', status: 'CLOSED' });
    const sub4 = submission({ id: 'submission:S4', questId: 'task:Q4', status: 'CHANGES_REQUESTED' });
    const sub5 = submission({ id: 'submission:S5', questId: 'task:Q5', status: 'APPROVED' });

    const dec2 = decision({ id: 'decision:D2', submissionId: 'submission:S2', kind: 'merge' });
    const dec3 = decision({ id: 'decision:D3', submissionId: 'submission:S3', kind: 'close' });

    const snapshot = makeSnapshot({
      quests: [q1, q2, q3, q4, q5],
      submissions: [sub1, sub2, sub3, sub4, sub5],
      decisions: [dec2, dec3],
    });

    const session = makeObservationSessionDouble(snapshot);

    // 2. Call readReviewLaneData
    const data = await readReviewLaneData(session as any);

    // 3. Assertions
    const returnedSubIds = data.submissions.map((s) => s.id);
    const returnedQuestIds = data.quests.map((q) => q.id);

    // Should include OPEN, CHANGES_REQUESTED, APPROVED
    expect(returnedSubIds).toContain('submission:S1');
    expect(returnedSubIds).toContain('submission:S4');
    expect(returnedSubIds).toContain('submission:S5');

    expect(returnedQuestIds).toContain('task:Q1');
    expect(returnedQuestIds).toContain('task:Q4');
    expect(returnedQuestIds).toContain('task:Q5');

    // Should NOT include MERGED, CLOSED
    expect(returnedSubIds).not.toContain('submission:S2');
    expect(returnedSubIds).not.toContain('submission:S3');

    expect(returnedQuestIds).not.toContain('task:Q2');
    expect(returnedQuestIds).not.toContain('task:Q3');
  });
});
