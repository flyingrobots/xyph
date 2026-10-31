import { describe, expect, it } from 'vitest';
import { formatUnreviewedIntegrationMessage } from '../../src/domain/services/SettlementIntegrationPolicy.js';

describe('formatUnreviewedIntegrationMessage', () => {
  it('does not say the tip is in the target when the target does not contain it', () => {
    const message = formatUnreviewedIntegrationMessage('abcdef123456', 'main', {
      integrationCommit: null,
      matchesPatchset: false,
      reason: 'main does not contain abcdef123456',
    });

    expect(message).not.toContain('is already in main');
    expect(message).toContain('does not contain');
  });

  it('names the integration commit when the target received other content', () => {
    const message = formatUnreviewedIntegrationMessage('abcdef123456', 'main', {
      integrationCommit: '0123456789abcdef',
      matchesPatchset: false,
      reason: 'reason text',
    });

    expect(message).toContain('0123456 brought it into main');
    expect(message).toContain('(reason text)');
  });
});
