import { styled, getTheme } from '../theme/index.js';

/**
 * Render a confirm dialog as a centered box overlaid on the given content.
 * Replaces center rows of the rendered content with the dialog box.
 */
export function confirmOverlay(content: string, prompt: string, cols: number, rows: number): string {
  const t = getTheme();
  const lines = content.split('\n');

  // Pad to fill screen
  while (lines.length < rows) lines.push('');

  // Dialog dimensions
  const maxPromptLen = Math.min(prompt.length, cols - 8);
  const boxW = Math.max(maxPromptLen + 6, 30);
  const boxH = 5;
  const startRow = Math.max(0, Math.floor((rows - boxH) / 2));
  const startCol = Math.max(0, Math.floor((cols - boxW) / 2));

  const pad = ' '.repeat(startCol);
  const borderColor = t.theme.border.primary;

  // Build box lines
  const top = styled(borderColor, '\u250C' + '\u2500'.repeat(boxW - 2) + '\u2510');
  const bot = styled(borderColor, '\u2514' + '\u2500'.repeat(boxW - 2) + '\u2518');
  const side = styled(borderColor, '\u2502');

  const promptLine = prompt.slice(0, boxW - 4).padEnd(boxW - 4);
  const hintText = styled(t.theme.semantic.info, 'y') + '/' + styled(t.theme.semantic.error, 'n');
  const hintLine = (`  ${hintText}  `).padEnd(boxW - 4);

  const boxLines = [
    `${pad}${top}`,
    `${pad}${side} ${promptLine} ${side}`,
    `${pad}${side}${' '.repeat(boxW - 2)}${side}`,
    `${pad}${side} ${hintLine} ${side}`,
    `${pad}${bot}`,
  ];

  // Overlay
  for (let i = 0; i < boxLines.length; i++) {
    const row = startRow + i;
    if (row < lines.length) {
      lines[row] = boxLines[i] ?? '';
    }
  }

  return lines.join('\n');
}

/**
 * Render a text input dialog as a centered box overlaid on the given content.
 */
export function inputOverlay(
  content: string,
  label: string,
  value: string,
  cols: number,
  rows: number,
): string {
  const t = getTheme();
  const lines = content.split('\n');

  while (lines.length < rows) lines.push('');

  const boxW = Math.max(Math.min(cols - 4, 60), 30);
  const boxH = 6;
  const startRow = Math.max(0, Math.floor((rows - boxH) / 2));
  const startCol = Math.max(0, Math.floor((cols - boxW) / 2));

  const pad = ' '.repeat(startCol);
  const borderColor = t.theme.border.primary;

  const side = styled(borderColor, '\u2502');
  const top = styled(borderColor, '\u250C' + '\u2500'.repeat(boxW - 2) + '\u2510');
  const bot = styled(borderColor, '\u2514' + '\u2500'.repeat(boxW - 2) + '\u2518');

  const labelLine = label.slice(0, boxW - 4).padEnd(boxW - 4);
  const inputW = boxW - 6;
  const displayValue = value.length > inputW ? value.slice(value.length - inputW) : value;
  const valueLine = (displayValue + '\u2588').padEnd(boxW - 4);
  const hintLine = styled(t.theme.semantic.muted, 'Enter: submit  Esc: cancel').padEnd(boxW - 4);

  const boxLines = [
    `${pad}${top}`,
    `${pad}${side} ${labelLine} ${side}`,
    `${pad}${side} ${valueLine} ${side}`,
    `${pad}${side}${' '.repeat(boxW - 2)}${side}`,
    `${pad}${side} ${hintLine} ${side}`,
    `${pad}${bot}`,
  ];

  for (let i = 0; i < boxLines.length; i++) {
    const row = startRow + i;
    if (row < lines.length) {
      lines[row] = boxLines[i] ?? '';
    }
  }

  return lines.join('\n');
}
