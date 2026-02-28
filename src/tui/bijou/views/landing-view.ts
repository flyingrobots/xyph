import { progressBar, gradientText, getDefaultContext } from '@flyingrobots/bijou';
import { styled, getTheme } from '../../theme/index.js';
import { spiralFrame } from '../shaders/spiral.js';
import type { DashboardModel } from '../DashboardApp.js';

/** A foreground content line with its pre-ANSI visual width. */
interface FgLine { text: string; width: number }

// Box-drawing characters
const TL = '\u250c'; // ┌
const TR = '\u2510'; // ┐
const BL = '\u2514'; // └
const BR = '\u2518'; // ┘
const HZ = '\u2500'; // ─
const VT = '\u2502'; // │

const PAD_H = 3; // horizontal padding inside border
const PAD_V = 1; // vertical padding inside border

export function landingView(model: DashboardModel): string {
  const t = getTheme();
  const ctx = getDefaultContext();
  const muted = t.theme.semantic.muted;
  const border = t.theme.border.primary;

  // ── Spiral background ────────────────────────────────────────────────
  const bg = spiralFrame(model.cols, model.rows, Date.now());

  // ── Foreground content ───────────────────────────────────────────────
  const fg: FgLine[] = [];

  // Logo
  const logoLines = model.logoText.split('\n');
  const maxW = logoLines.reduce((m, l) => Math.max(m, l.length), 0);
  const padded = logoLines.map(l => l.padEnd(maxW));
  for (const line of padded) {
    fg.push({
      text: gradientText(line, t.theme.gradient.brand, { style: ctx.style }),
      width: line.length,
    });
  }
  fg.push({ text: '', width: 0 });

  // Copyright
  const copyright = 'Copyright \u00a9 2026 FlyingRobots';
  fg.push({ text: styled(muted, copyright), width: copyright.length });
  fg.push({ text: '', width: 0 });

  // Status text (below copyright)
  if (model.loading) {
    // no status text — progress bar at bottom
  } else if (model.error) {
    const errText = `Error: ${model.error}`;
    fg.push({ text: styled(t.theme.semantic.error, errText), width: errText.length });
    fg.push({ text: '', width: 0 });
    const press = 'Press any key to continue\u2026';
    fg.push({ text: styled(muted, press), width: press.length });
  } else if (model.snapshot) {
    const snap = model.snapshot;
    const stats = `${snap.quests.length} quests, ${snap.campaigns.length} campaigns`;
    fg.push({ text: styled(muted, stats), width: stats.length });
    fg.push({ text: '', width: 0 });
    const press = 'Press any key to continue\u2026';
    const pulseToken = model.pulsePhase >= 50 ? t.theme.semantic.primary : muted;
    fg.push({ text: styled(pulseToken, press), width: press.length });
  }

  // ── Box dimensions ───────────────────────────────────────────────────
  const maxContentW = fg.reduce((m, e) => Math.max(m, e.width), 0);
  const boxInnerW = maxContentW + PAD_H * 2;
  const boxOuterW = boxInnerW + 2; // +2 for left/right borders
  const boxOuterH = fg.length + PAD_V * 2 + 2; // +2 for top/bottom borders
  const boxLeft = Math.max(0, Math.floor((model.cols - boxOuterW) / 2));
  const boxTop = Math.max(0, Math.floor((model.rows - boxOuterH) / 2));
  const progressRow = model.loading ? model.rows - 1 : -1;

  // ── Composite: spiral + box + progress bar ───────────────────────────
  const output: string[] = [];

  for (let row = 0; row < model.rows; row++) {
    // Progress bar replaces the last row during loading
    if (row === progressRow) {
      output.push(progressBar(model.loadingProgress, {
        width: Math.max(1, model.cols),
        gradient: t.theme.gradient.progress,
        showPercent: true,
      }));
      continue;
    }

    const bgLine = bg[row] ?? '';
    const by = row - boxTop; // row relative to box

    if (by < 0 || by >= boxOuterH) {
      // Pure spiral — above or below the box
      output.push(styled(muted, bgLine));
      continue;
    }

    // Spiral gutters (left + right of the box)
    const spiralL = styled(muted, bgLine.slice(0, boxLeft));
    const spiralR = styled(muted, bgLine.slice(boxLeft + boxOuterW));

    if (by === 0) {
      // Top border
      const rule = TL + HZ.repeat(boxInnerW) + TR;
      output.push(spiralL + styled(border, rule) + spiralR);
    } else if (by === boxOuterH - 1) {
      // Bottom border
      const rule = BL + HZ.repeat(boxInnerW) + BR;
      output.push(spiralL + styled(border, rule) + spiralR);
    } else {
      // Interior row
      const contentIdx = by - 1 - PAD_V;
      const entry = contentIdx >= 0 && contentIdx < fg.length ? fg[contentIdx] : undefined;

      let interior: string;
      if (entry && entry.width > 0) {
        // Center content within the box interior
        const lpad = Math.floor((boxInnerW - entry.width) / 2);
        const rpad = boxInnerW - lpad - entry.width;
        interior = ' '.repeat(lpad) + entry.text + ' '.repeat(rpad);
      } else {
        // Empty interior (padding or spacer)
        interior = ' '.repeat(boxInnerW);
      }

      output.push(
        spiralL +
        styled(border, VT) + interior + styled(border, VT) +
        spiralR,
      );
    }
  }

  return output.join('\n');
}
