import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { visibleLength } from '@flyingrobots/bijou-tui';
import { createStylePort } from '../../../infrastructure/adapters/BijouStyleAdapter.js';
import { confirmOverlay, inputOverlay } from '../overlays.js';

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

  it('renders input overlays at a stable readable width instead of shrinking to content', () => {
    const style = createStylePort();
    const background = Array.from({ length: 20 }, () => ' '.repeat(80)).join('\n');
    const rendered = inputOverlay(background, 'Comment on task:Q1:', '', 80, 20, style);
    const topBorderLine = rendered.split('\n').find((line) => line.includes('┌') && line.includes('┐'));

    expect(topBorderLine).toBeDefined();
    const start = topBorderLine?.indexOf('┌') ?? -1;
    const end = topBorderLine?.lastIndexOf('┐') ?? -1;
    const box = start >= 0 && end >= start ? topBorderLine?.slice(start, end + 1) ?? '' : '';
    expect(visibleLength(box)).toBeGreaterThanOrEqual(38);
  });
});
