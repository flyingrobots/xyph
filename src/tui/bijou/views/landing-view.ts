import { flex } from '@flyingrobots/bijou-tui';
import { progressBar, gradientText, getDefaultContext } from '@flyingrobots/bijou';
import { styled, getTheme } from '../../theme/index.js';
import type { DashboardModel } from '../DashboardApp.js';

export function landingView(model: DashboardModel): string {
  const t = getTheme();
  const ctx = getDefaultContext();
  const lines: string[] = [];

  // Pad logo lines to max width to prevent ragged alignment (item 4)
  const logoLines = model.logoText.split('\n');
  const maxW = logoLines.reduce((m, l) => Math.max(m, l.length), 0);
  const padded = logoLines.map(l => l.padEnd(maxW));

  // Apply gradient to each line (item 6)
  const gradientLogo = padded
    .map(line => gradientText(line, t.theme.gradient.brand, { style: ctx.style }))
    .join('\n');

  lines.push(gradientLogo);
  lines.push('');

  // Copyright
  lines.push(styled(t.theme.semantic.muted, 'Copyright \u00a9 2026 FlyingRobots'));
  lines.push('');

  if (model.loading) {
    // Animated progress bar while loading
    const barWidth = Math.max(12, Math.min(40, model.cols - 6));
    lines.push(progressBar(model.loadingProgress, {
      width: barWidth,
      gradient: t.theme.gradient.progress,
      showPercent: true,
    }));
  } else if (model.error) {
    lines.push(styled(t.theme.semantic.error, `Error: ${model.error}`));
    lines.push('');
    lines.push(styled(t.theme.semantic.muted, 'Press any key to continue\u2026'));
  } else if (model.snapshot) {
    const snap = model.snapshot;
    lines.push(styled(t.theme.semantic.muted, `${snap.quests.length} quests, ${snap.campaigns.length} campaigns`));
    lines.push('');
    // Pulsing "Press any key" text (item 5)
    const pulseToken = model.pulsePhase >= 50 ? t.theme.semantic.primary : t.theme.semantic.muted;
    lines.push(styled(pulseToken, 'Press any key to continue\u2026'));
  }

  const content = lines.join('\n');

  return flex(
    { direction: 'column', width: model.cols, height: model.rows },
    { flex: 1, content: '' },
    { align: 'center', content },
    { flex: 1, content: '' },
  );
}
