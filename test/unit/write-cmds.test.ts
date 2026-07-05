import { describe, expect, it } from 'vitest';
import { adoptSuggestion, supersedeSuggestion } from '../../src/tui/bijou/write-cmds.js';

describe('write-cmds suggestion resolutions', () => {
  it('requires a rationale before adopting a suggestion', async () => {
    const emitted: unknown[] = [];

    await adoptSuggestion(
      { agentId: 'agent.test' },
      'suggestion:S1',
      'proposal',
      '   ',
    )((msg) => {
      emitted.push(msg);
    });

    expect(emitted).toEqual([
      { type: 'write-error', message: 'Rationale is required to adopt a suggestion' },
    ]);
  });

  it('requires a rationale before superseding a suggestion', async () => {
    const emitted: unknown[] = [];

    await supersedeSuggestion(
      { agentId: 'agent.test' },
      {
        suggestionId: 'suggestion:S1',
        supersededById: 'task:Q2',
        rationale: '   ',
      },
    )((msg) => {
      emitted.push(msg);
    });

    expect(emitted).toEqual([
      { type: 'write-error', message: 'Rationale is required to supersede a suggestion' },
    ]);
  });
});
