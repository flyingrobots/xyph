import { styled, getTheme } from '../../theme/index.js';
import type { DashboardModel } from '../DashboardApp.js';

export function landingView(model: DashboardModel): string {
  const t = getTheme();
  const lines: string[] = [];

  // Show the logo
  lines.push(model.logoText);
  lines.push('');

  if (model.loading) {
    lines.push(styled(t.theme.semantic.warning, '  Loading project graph snapshot…'));
  } else if (model.error) {
    lines.push(styled(t.theme.semantic.error, `  Error: ${model.error}`));
  } else if (model.snapshot) {
    const snap = model.snapshot;
    lines.push(styled(t.theme.semantic.muted, `  ${snap.quests.length} quests, ${snap.campaigns.length} campaigns`));
  }

  lines.push('');
  lines.push(styled(t.theme.semantic.muted, '  Press any key to continue…'));

  return lines.join('\n');
}
