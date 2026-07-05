import { describe, expect, it, vi } from 'vitest';
import { runtimeCommandIntentEmission } from '@flyingrobots/bijou-tui';
import { defineBindingLifecycleOwner } from '@flyingrobots/bijou';
import type { IntakePort } from '../../src/ports/IntakePort.js';
import type { SubmissionPort } from '../../src/ports/SubmissionPort.js';
import { TuiCommandIntentExecutorAdapter } from '../../src/infrastructure/warp/TuiCommandIntentExecutorAdapter.js';
import {
  claimQuestIntentRoute,
  claimQuestUiIntent,
  rejectQuest,
} from '../../src/tui/bijou/write-cmds.js';

describe('write-cmds admission honesty', () => {
  it('rejects a descriptor whose operation does not match the requested write', async () => {
    const executor = new TuiCommandIntentExecutorAdapter();
    const run = vi.fn(async () => 'sha:reject');

    const outcome = await executor.execute({
      descriptor: {
        intentId: 'intent:xyph:rejectQuest:test',
        suffixTransform: {
          op: 'rejectQuest:mismatch',
        },
      },
      expectedOperation: 'rejectQuest',
      intent: {
        op: 'rejectQuest',
        payload: { questId: 'task:Q1', rationale: 'duplicate' },
      },
      run,
    });

    expect(run).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      admitted: false,
      intentId: 'intent:xyph:rejectQuest:test',
      obstruction: {
        tag: 'IntentOperationMismatch',
        actual: 'rejectQuest:mismatch',
      },
    });
  });

  it('executes UI-only write operations through the injected command executor', async () => {
    const reject = vi.fn(async () => 'sha:reject');
    const execute = vi.fn(async ({ run }: { run: () => Promise<unknown> }) => {
      await run();
      return {
        admitted: true,
        intentId: 'intent:xyph:rejectQuest:test',
        sha: 'sha:reject',
      };
    });
    const emitted: unknown[] = [];

    await rejectQuest({
      intake: { reject } as unknown as IntakePort,
      submissionPort: {} as SubmissionPort,
      commandIntentExecutor: { execute },
      agentId: 'agent.test',
    }, 'task:Q1', 'duplicate')((msg) => {
      emitted.push(msg);
    });

    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      expectedOperation: 'rejectQuest',
      intent: expect.objectContaining({
        op: 'rejectQuest',
        payload: expect.objectContaining({
          questId: 'task:Q1',
          rationale: 'duplicate',
          agentId: 'agent.test',
        }),
      }),
    }));
    expect(reject).toHaveBeenCalledWith('task:Q1', 'duplicate');
    expect(emitted).toEqual([
      {
        type: 'write-success',
        message: 'Rejected task:Q1',
      },
    ]);
  });

  it('does not emit fake claim basis support and keeps claim intent ids unique', () => {
    const owner = defineBindingLifecycleOwner({ id: 'agent.test', kind: 'view', label: 'agent.test' });
    const first = claimQuestIntentRoute.toCommand(runtimeCommandIntentEmission(
      claimQuestUiIntent,
      { questId: 'task:Q1' },
      { owner },
    ));
    const second = claimQuestIntentRoute.toCommand(runtimeCommandIntentEmission(
      claimQuestUiIntent,
      { questId: 'task:Q1' },
      { owner },
    ));

    expect(first.intentId).not.toBe(second.intentId);
    expect(first.suffixTransform?.payload).toEqual({
      questId: 'task:Q1',
      agentId: 'agent.test',
    });
    expect(JSON.stringify(first)).not.toContain('sha256:basis123');
  });
});
