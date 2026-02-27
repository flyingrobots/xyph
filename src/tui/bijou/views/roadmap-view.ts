import { headerBox, dag, type DagNode } from '@flyingrobots/bijou';
import { flex, viewport } from '@flyingrobots/bijou-tui';
import { styled, styledStatus, getTheme } from '../../theme/index.js';
import type { DashboardModel } from '../DashboardApp.js';
import { computeFrontier, computeCriticalPath, type TaskSummary, type DepEdge } from '../../../domain/services/DepAnalysis.js';

/** Map quest status to a single-char token for DAG badges. */
function statusIcon(status: string): string {
  switch (status) {
    case 'DONE':        return '\u2713';
    case 'IN_PROGRESS': return '\u25B6';
    case 'BLOCKED':     return '\u2718';
    case 'PLANNED':     return '\u25CB';
    case 'BACKLOG':     return '\u00B7';
    default:            return '?';
  }
}

export function roadmapView(model: DashboardModel, width?: number, height?: number): string {
  const t = getTheme();
  const w = width ?? model.cols;
  const h = height ?? (model.rows - 3);

  if (!model.snapshot) return styled(t.theme.semantic.muted, '  No snapshot loaded.');
  // Bind after null guard so closures see the narrowed type.
  const snap = model.snapshot;

  if (snap.quests.length === 0) {
    const lines: string[] = [];
    lines.push(headerBox('XYPH Roadmap', {
      detail: `snapshot at ${new Date(snap.asOf).toISOString()}`,
      borderToken: t.theme.border.primary,
    }));
    lines.push(styled(t.theme.semantic.muted, '\n  No quests yet.'));
    return lines.join('\n');
  }

  // Build dependency data
  const tasks: TaskSummary[] = snap.quests.map(q => ({
    id: q.id,
    status: q.status,
    hours: q.hours,
  }));

  const edges: DepEdge[] = [];
  for (const q of snap.quests) {
    if (q.dependsOn) {
      for (const dep of q.dependsOn) {
        edges.push({ from: q.id, to: dep });
      }
    }
  }

  const hasDeps = edges.length > 0;

  // Frontier analysis
  const { frontier, blockedBy } = computeFrontier(tasks, edges);

  // Critical path (simple topo sort for DP — use task order as approximation)
  const sortedIds = snap.quests.map(q => q.id);
  const { path: criticalPath } = computeCriticalPath(sortedIds, tasks, edges);
  const critSet = new Set(criticalPath);

  // Quest lookup
  const questMap = new Map(snap.quests.map(q => [q.id, q]));

  // ── Left panel: Frontier ──────────────────────────────────────────────
  const leftWidth = Math.max(28, Math.floor(w * 0.3));

  // Build the ordered list of selectable quest IDs (non-DONE, matching frontier panel order)
  const selectableIds: string[] = snap.quests.filter(q => q.status !== 'DONE').map(q => q.id);
  const selectedQuestId = selectableIds[model.roadmap.selectedIndex] ?? null;

  function renderFrontierPanel(_pw: number, ph: number): string {
    const lines: string[] = [];

    if (hasDeps) {
      lines.push(styled(t.theme.semantic.primary, ' \u25B6 Ready'));
      lines.push('');

      if (frontier.length === 0) {
        lines.push(styled(t.theme.semantic.muted, '  (all tasks blocked)'));
      } else {
        for (const id of frontier) {
          const q = questMap.get(id);
          if (!q) continue;
          const icon = statusIcon(q.status);
          const mark = critSet.has(id) ? styled(t.theme.semantic.warning, ' \u2605') : '';
          const sel = id === selectedQuestId ? styled(t.theme.semantic.primary, '\u25B6') : ' ';
          const titleStyle = id === selectedQuestId
            ? styled(t.theme.semantic.primary, q.title.slice(0, leftWidth - 15))
            : q.title.slice(0, leftWidth - 15);
          lines.push(`${sel}${icon} ${styledStatus(q.status, q.status.padEnd(4))} ${titleStyle}${mark}`);
        }
      }

      // Blocked section
      const blockedIds = [...blockedBy.keys()].sort();
      if (blockedIds.length > 0) {
        lines.push('');
        lines.push(styled(t.theme.semantic.error, ' \u2718 Blocked'));
        lines.push('');
        for (const id of blockedIds) {
          const q = questMap.get(id);
          if (!q) continue;
          const deps = blockedBy.get(id) ?? [];
          const sel = id === selectedQuestId ? styled(t.theme.semantic.primary, '\u25B6') : ' ';
          const titleStyle = id === selectedQuestId
            ? styled(t.theme.semantic.primary, q.title.slice(0, leftWidth - 11))
            : q.title.slice(0, leftWidth - 11);
          lines.push(`${sel}${styled(t.theme.semantic.muted, '\u25CB')} ${titleStyle}`);
          lines.push(`   ${styled(t.theme.semantic.muted, `waits on ${deps.length} task(s)`)}`);
        }
      }
    } else {
      // No dependencies — group by status
      lines.push(styled(t.theme.semantic.primary, ' Quests'));
      lines.push('');

      const byStatus = new Map<string, typeof snap.quests>();
      for (const q of snap.quests) {
        if (q.status === 'DONE') continue;
        const arr = byStatus.get(q.status) ?? [];
        arr.push(q);
        byStatus.set(q.status, arr);
      }

      for (const [status, quests] of byStatus) {
        lines.push(` ${styledStatus(status)}`);
        for (const q of quests) {
          const sel = q.id === selectedQuestId ? styled(t.theme.semantic.primary, '\u25B6') : ' ';
          const titleStyle = q.id === selectedQuestId
            ? styled(t.theme.semantic.primary, q.title.slice(0, leftWidth - 9))
            : q.title.slice(0, leftWidth - 9);
          lines.push(` ${sel}${statusIcon(q.status)} ${titleStyle}`);
        }
        lines.push('');
      }

      // Done count
      const doneCount = snap.quests.filter(q => q.status === 'DONE').length;
      if (doneCount > 0) {
        lines.push(styled(t.theme.semantic.success, ` \u2713 ${doneCount} done`));
      }
    }

    const content = lines.join('\n');
    if (ph > 0) {
      return viewport({ width: _pw, height: ph, content, scrollY: 0 });
    }
    return content;
  }

  // ── Right panel: DAG ──────────────────────────────────────────────────

  function renderDagPanel(pw: number, ph: number): string {
    if (!hasDeps) {
      // Fallback: show the legacy table when no deps exist
      const lines: string[] = [];
      lines.push(headerBox('XYPH Roadmap', {
        detail: `snapshot at ${new Date(snap.asOf).toISOString()}`,
        borderToken: t.theme.border.primary,
      }));

      const campaignTitle = new Map<string, string>();
      for (const c of snap.campaigns) {
        campaignTitle.set(c.id, c.title);
      }

      const grouped = new Map<string, typeof snap.quests>();
      for (const q of snap.quests) {
        const key = q.campaignId ?? '(no campaign)';
        const arr = grouped.get(key) ?? [];
        arr.push(q);
        grouped.set(key, arr);
      }

      for (const [key, quests] of grouped) {
        const heading = campaignTitle.get(key) ?? key;
        lines.push('');
        lines.push(styled(t.theme.ui.sectionHeader, `  ${heading}`));
        for (const q of quests) {
          lines.push(`  ${statusIcon(q.status)} ${styled(t.theme.semantic.muted, q.id.slice(0, 16))}  ${q.title.slice(0, 40)}  ${styledStatus(q.status)}`);
        }
      }

      return viewport({ width: pw, height: ph, content: lines.join('\n'), scrollY: model.roadmap.dagScrollY });
    }

    // Build DagNode[] from quests
    const dagNodes: DagNode[] = snap.quests.map(q => ({
      id: q.id,
      label: q.id.replace(/^task:/, ''),
      edges: q.dependsOn ?? [],
      badge: styledStatus(q.status),
      token: critSet.has(q.id) ? t.theme.semantic.warning : undefined,
    }));

    const dagContent = dag(dagNodes, {
      highlightPath: criticalPath.length > 1 ? criticalPath : undefined,
      highlightToken: t.theme.semantic.warning,
      maxWidth: pw - 2,
    });

    return viewport({
      width: pw,
      height: ph,
      content: dagContent,
      scrollY: model.roadmap.dagScrollY,
    });
  }

  // ── Compose two-column layout ─────────────────────────────────────────
  return flex(
    { direction: 'row', width: w, height: h },
    { basis: leftWidth, content: renderFrontierPanel },
    { flex: 1, content: renderDagPanel },
  );
}
