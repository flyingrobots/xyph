import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createStylePort } from '../../../infrastructure/adapters/BijouStyleAdapter.js';
import { confirmOverlay } from '../overlays.js';

describe('confirmOverlay', () => {
  beforeEach(() => {
    delete process.env['NO_COLOR'];
    delete process.env['XYPH_THEME'];
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('terminates custom hint styling before the modal border', () => {
    const style = createStylePort();
    const customHint =
      style.styled(style.theme.semantic.info, 'q') + ' / ' +
      style.styled(style.theme.semantic.info, 'y') + '  confirm · ' +
      style.styled(style.theme.semantic.error, 'n') + ' / ' +
      style.styled(style.theme.semantic.error, 'esc') + '  cancel';

    const background = Array.from({ length: 14 }, () => ' '.repeat(80)).join('\n');
    const rendered = confirmOverlay(background, 'Quit XYPH?', 80, 14, style, customHint);
    const hintLine = rendered
      .split('\n')
      .find((line) => line.includes('confirm') && line.includes('cancel'));

    expect(hintLine).toBeDefined();
    expect(hintLine?.indexOf('\u001b[0m', hintLine.indexOf('cancel')) ?? -1).toBeGreaterThan(hintLine?.indexOf('cancel') ?? -1);
  });
});
