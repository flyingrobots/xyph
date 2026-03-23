import { composite, modal } from '@flyingrobots/bijou-tui';
import type { StylePort } from '../../ports/StylePort.js';
import { wrapWhitespaceText } from '../view-helpers.js';

const ANSI_RESET = '\u001b[0m';

function terminateHintStyles(style: StylePort, text: string): string {
  return style.noColor ? text : `${text}${ANSI_RESET}`;
}

/**
 * Render a confirm dialog as a centered modal overlaid on the given content.
 */
export function confirmOverlay(content: string, prompt: string, cols: number, rows: number, style: StylePort, customHint?: string): string {
  const hint = terminateHintStyles(
    style,
    customHint
      ?? 'y / n'.replace('y', style.styled(style.theme.semantic.info, 'y')).replace('n', style.styled(style.theme.semantic.error, 'n')),
  );

  const overlay = modal({
    body: prompt,
    hint,
    screenWidth: cols,
    screenHeight: rows,
    borderToken: style.theme.border.primary,
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
  style: StylePort,
  customHint?: string,
): string {
  const modalWidth = Math.max(38, Math.min(80, Math.floor(cols * 0.72)));
  const innerWidth = Math.max(1, modalWidth - 4);
  const inputWidth = Math.max(1, innerWidth - 1);
  const labelLines = wrapWhitespaceText(label, innerWidth);
  const displayValue = value.length > inputWidth ? value.slice(value.length - inputWidth) : value;
  const body = [...labelLines, '', `${displayValue}\u2588`].join('\n');
  const hint = terminateHintStyles(
    style,
    style.styled(style.theme.semantic.muted, customHint ?? 'Enter: submit  Esc: cancel'),
  );

  const overlay = modal({
    body,
    hint,
    screenWidth: cols,
    screenHeight: rows,
    borderToken: style.theme.border.primary,
    width: modalWidth,
  });
  return composite(content, [overlay], { dim: true });
}
