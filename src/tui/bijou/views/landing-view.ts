import { flex } from '@flyingrobots/bijou-tui';
import { progressBar } from '@flyingrobots/bijou';
import { styled, getTheme } from '../../theme/index.js';
import type { DashboardModel } from '../DashboardApp.js';

export function landingView(model: DashboardModel): string {
  const t = getTheme();
  const lines: string[] = [];

  // Show the logo
  lines.push(model.logoText);
  lines.push('');

  // Copyright
  lines.push(styled(t.theme.semantic.muted, 'Copyright \u00a9 2026 FlyingRobots'));
  lines.push('');

  if (model.loading) {
    // Animated progress bar while loading
    lines.push(progressBar(model.loadingProgress, {
      width: 40,
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
    lines.push(styled(t.theme.semantic.muted, 'Press any key to continue\u2026'));
  }

  const content = lines.join('\n');

  return flex(
    { direction: 'column', width: model.cols, height: model.rows },
    { flex: 1, content: '' },
    { align: 'center', content },
    { flex: 1, content: '' },
  );
}
