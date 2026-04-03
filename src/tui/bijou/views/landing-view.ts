import { getDefaultContext, progressBar, surfaceToString } from '@flyingrobots/bijou';
import { canvas, composite, modal } from '@flyingrobots/bijou-tui';
import type { StylePort } from '../../../ports/StylePort.js';
import { spiralShader, spiralFrame } from '../shaders/spiral.js';
import type { DashboardModel } from '../DashboardApp.js';

/** A foreground content line with its pre-ANSI visual width. */
interface FgLine { text: string; width: number }

let cachedLoadingBackground:
  | { cols: number; rows: number; rendered: string }
  | null = null;

function renderLandingBackground(
  model: DashboardModel,
  style: StylePort,
  muted: StylePort['theme']['semantic']['muted'],
): string {
  if (
    model.loading
    && cachedLoadingBackground
    && cachedLoadingBackground.cols === model.cols
    && cachedLoadingBackground.rows === model.rows
  ) {
    return cachedLoadingBackground.rendered;
  }

  const ctx = getDefaultContext();
  let bg = surfaceToString(
    canvas(model.cols, model.rows, spiralShader, {
      time: Date.now() / 1000,
      uniforms: { cols: model.cols, rows: model.rows },
    }),
    ctx.style,
  );
  if (!bg.trim()) {
    bg = spiralFrame(model.cols, model.rows, Date.now()).join('\n');
  }
  const rendered = style.styled(muted, bg);
  if (model.loading) {
    cachedLoadingBackground = {
      cols: model.cols,
      rows: model.rows,
      rendered,
    };
  }
  return rendered;
}

export function landingView(model: DashboardModel, style: StylePort): string {
  const muted = style.theme.semantic.muted;
  const border = style.theme.border.primary;

  // ── Spiral background ────────────────────────────────────────────────
  const styledBg = renderLandingBackground(model, style, muted);

  // ── Foreground content ───────────────────────────────────────────────
  const fg: FgLine[] = [];

  // Logo
  const logoLines = model.logoText.split('\n');
  const maxW = logoLines.reduce((m, l) => Math.max(m, l.length), 0);
  const padded = logoLines.map(l => l.padEnd(maxW));
  for (const line of padded) {
    fg.push({
      text: style.gradient(line, style.theme.gradient.brand),
      width: line.length,
    });
  }
  fg.push({ text: '', width: 0 });

  // Copyright
  const copyright = 'Copyright \u00a9 2026 FlyingRobots';
  fg.push({ text: style.styled(muted, copyright), width: copyright.length });
  fg.push({ text: '', width: 0 });

  // Status text
  if (model.loading) {
    // no status text — progress bar at bottom
  } else if (model.error) {
    const errText = `Error: ${model.error}`;
    fg.push({ text: style.styled(style.theme.semantic.error, errText), width: errText.length });
    fg.push({ text: '', width: 0 });
    const press = 'Press any key to continue\u2026';
    fg.push({ text: style.styled(muted, press), width: press.length });
  } else if (model.snapshot) {
    const snap = model.snapshot;
    const stats = `${snap.quests.length} quests, ${snap.campaigns.length} campaigns`;
    fg.push({ text: style.styled(muted, stats), width: stats.length });
    fg.push({ text: '', width: 0 });
    const press = 'Press any key to continue\u2026';
    const pulseToken = model.pulsePhase >= 50 ? style.theme.semantic.primary : muted;
    fg.push({ text: style.styled(pulseToken, press), width: press.length });
  }

  // ── Center each line within the widest line ──────────────────────────
  const maxContentW = fg.reduce((m, e) => Math.max(m, e.width), 0);
  const centeredLines = fg.map(entry => {
    if (entry.width <= 0) return '';
    const lpad = Math.floor((maxContentW - entry.width) / 2);
    return ' '.repeat(lpad) + entry.text;
  });

  // ── Composite: modal over spiral ──────────────────────────────────────
  const body = centeredLines.join('\n');
  const fgOverlay = modal({ body, screenWidth: model.cols, screenHeight: model.rows, borderToken: border });
  let output = composite(styledBg, [fgOverlay]);

  // Progress bar replaces the last row during loading
  if (model.loading) {
    const lines = output.split('\n');
    if (lines.length > 0) {
      lines[lines.length - 1] = progressBar(model.loadingProgress, {
        width: Math.max(1, model.cols),
        gradient: style.theme.gradient.progress,
        showPercent: true,
      });
      output = lines.join('\n');
    }
  }

  return output;
}
