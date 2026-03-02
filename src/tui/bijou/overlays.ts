import { composite, modal } from '@flyingrobots/bijou-tui';
import { styled, getTheme } from '../theme/index.js';

/**
 * Render a confirm dialog as a centered modal overlaid on the given content.
 */
export function confirmOverlay(content: string, prompt: string, cols: number, rows: number): string {
  const t = getTheme();
  const hintPlain = 'y / n';
  const hint = hintPlain.replace('y', styled(t.theme.semantic.info, 'y')).replace('n', styled(t.theme.semantic.error, 'n'));

  const overlay = modal({
    body: prompt,
    hint,
    screenWidth: cols,
    screenHeight: rows,
    borderToken: t.theme.border.primary,
  });
  return composite(content, [overlay], { dim: true });
}

/**
 * Render a text input dialog as a centered modal overlaid on the given content.
 */
export function inputOverlay(
  content: string,
  label: string,
  value: string,
  cols: number,
  rows: number,
): string {
  const t = getTheme();
  const inputW = Math.max(Math.min(cols - 10, 54), 24);
  const displayValue = value.length > inputW ? value.slice(value.length - inputW) : value;
  const body = `${label}\n${displayValue}\u2588`;
  const hint = styled(t.theme.semantic.muted, 'Enter: submit  Esc: cancel');

  const overlay = modal({
    body,
    hint,
    screenWidth: cols,
    screenHeight: rows,
    borderToken: t.theme.border.primary,
  });
  return composite(content, [overlay], { dim: true });
}
