import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import type { CliContext } from '../../src/cli/context.js';

const fetchSnapshot = vi.fn();
const filter = vi.fn();
const select = vi.fn();
const textarea = vi.fn();
const confirm = vi.fn();
const input = vi.fn();
const review = vi.fn();
const validateReview = vi.fn();

vi.mock('../../src/infrastructure/adapters/WarpObservationAdapter.js', () => ({
  WarpObservationAdapter: class WarpObservationAdapter {
    async openSession() {
      return {
        fetchSnapshot,
        fetchEntityDetail: vi.fn(),
        queryNodes: vi.fn(),
        neighbors: vi.fn(),
        hasNode: vi.fn(),
      };
    }
  },
}));

vi.mock('@flyingrobots/bijou', () => ({
  filter: (options: unknown) => filter(options),
  select: (options: unknown) => select(options),
  textarea: (options: unknown) => textarea(options),
  confirm: (options: unknown) => confirm(options),
  input: (options: unknown) => input(options),
}));

vi.mock('../../src/infrastructure/adapters/WarpSubmissionAdapter.js', () => ({
  WarpSubmissionAdapter: class WarpSubmissionAdapter {
    review(input: unknown) {
      return review(input);
    }
  },
}));

vi.mock('../../src/domain/services/SubmissionService.js', () => ({
  SubmissionService: class SubmissionService {
    validateReview(patchsetId: string, agentId: string) {
      return validateReview(patchsetId, agentId);
    }
  },
}));

import { registerWizardCommands } from '../../src/cli/commands/wizards.js';

function makeCtx(): CliContext {
  const observation = {
    openSession: vi.fn(async () => ({
      fetchSnapshot,
      fetchEntityDetail: vi.fn(),
      queryNodes: vi.fn(),
      neighbors: vi.fn(),
      hasNode: vi.fn(),
    })),
  };
  return {
    agentId: 'human.reviewer',
    identity: { agentId: 'human.reviewer', source: 'default', origin: null },
    json: false,
    graphPort: {
      getGraph: vi.fn(),
    } as CliContext['graphPort'],
    observation: observation as CliContext['observation'],
    operationalRead: observation as CliContext['operationalRead'],
    inspection: {
      openInspectionSession: vi.fn(),
    } as CliContext['inspection'],
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

describe('wizard commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchSnapshot.mockResolvedValue({
      quests: [{
        id: 'task:Q-1',
        title: 'Quest one',
        status: 'READY',
        hours: 3,
      }],
      submissions: [{
        id: 'submission:S-1',
        questId: 'task:Q-1',
        status: 'OPEN',
        headsCount: 1,
        approvalCount: 0,
        submittedBy: 'agent.other',
        submittedAt: 1_700_000_000_000,
        tipPatchsetId: 'patchset:P-1',
      }],
      campaigns: [],
      intents: [],
    });
    filter.mockResolvedValue('submission:S-1');
    select.mockResolvedValue('approve');
    textarea.mockResolvedValue('Looks good.');
    confirm.mockResolvedValue(true);
    input.mockResolvedValue('unused');
    validateReview.mockResolvedValue(undefined);
    review.mockResolvedValue({ patchSha: 'patch:review-1' });
  });

  it('uses the operational snapshot profile for interactive review wizard reads', async () => {
    const ctx = makeCtx();
    const program = new Command();
    registerWizardCommands(program, ctx);

    await program.parseAsync(['review-wizard'], { from: 'user' });

    expect(fetchSnapshot).toHaveBeenCalledWith('operational');
    expect(validateReview).toHaveBeenCalledWith('patchset:P-1', 'human.reviewer');
    expect(review).toHaveBeenCalledWith({
      patchsetId: 'patchset:P-1',
      reviewId: expect.stringMatching(/^review:/),
      verdict: 'approve',
      comment: 'Looks good.',
    });
  });
});
