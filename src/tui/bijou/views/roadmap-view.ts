import { headerBox, type SlicedDagSource, getDefaultContext } from '@flyingrobots/bijou';
import { flex, viewport, composite, drawer, dagPane } from '@flyingrobots/bijou-tui';
import type { StylePort } from '../../../ports/StylePort.js';
import type { DashboardModel } from '../DashboardApp.js';
import type { GraphSnapshot } from '../../../domain/models/dashboard.js';
import { computeFrontier, computeCriticalPath, computeTopBlockers, type TaskSummary, type DepEdge } from '../../../domain/services/DepAnalysis.js';
import { roadmapQuestIds } from '../selection-order.js';

/** Map quest status to a single-char token for DAG badges. */
function statusIcon(status: string): string {
  switch (status) {
    case 'DONE':        return '\u2713';
    case 'IN_PROGRESS': return '\u25B6';
    case 'BLOCKED':     return '\u2718';
    case 'PLANNED':     return '\u25CB';
    case 'BACKLOG':     return '\u00B7';
    case 'GRAVEYARD':   return '\u2620';
    default:            return '?';
  }
}

/** Build a SlicedDagSource adapter for the dagPane. Only colors critical-path nodes via token. */
export function buildDagSource(
  snap: GraphSnapshot,
  critSet: Set<string>,
  style: StylePort,
): SlicedDagSource {
  const questMap = new Map(snap.quests.map(q => [q.id, q]));
  const questIds = snap.quests.map(q => q.id);
  return {
    ids: () => questIds,
    has: (id) => questMap.has(id),
    label: (id) => id.replace(/^task:/, ''),
    children: (id) => questMap.get(id)?.dependsOn ?? [],
    badge: (id): string | undefined => {
      const q = questMap.get(id);
      return q ? style.styledStatus(q.status) : undefined;
    },
    token: (id) => critSet.has(id) ? style.theme.semantic.warning : undefined,
    ghost: () => false,
    ghostLabel: () => undefined,
  };
}

export function roadmapView(model: DashboardModel, style: StylePort, width?: number, height?: number): string {
  const w = width ?? model.cols;
  const h = height ?? (model.rows - 3);

  if (!model.snapshot) return style.styled(style.theme.semantic.muted, '  No snapshot loaded.');
  // Bind after null guard so closures see the narrowed type.
  const snap = model.snapshot;

  if (snap.quests.length === 0) {
    const lines: string[] = [];
    lines.push(headerBox('XYPH Roadmap', {
      detail: `snapshot at ${new Date(snap.asOf).toISOString()}`,
      borderToken: style.theme.border.primary,
    }));
    lines.push(style.styled(style.theme.semantic.muted, '\n  No quests yet.'));
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

  // Critical path via DP over engine-sorted IDs (git-warp topologicalSort)
  const { path: criticalPath } = computeCriticalPath(snap.sortedTaskIds, tasks, edges);
  const critSet = new Set(criticalPath);

  // Top blockers (hoisted out of render callback to avoid recomputation)
  const topBlockers = computeTopBlockers(tasks, edges, 5);

  // Quest lookup
  const questMap = new Map(snap.quests.map(q => [q.id, q]));

  // ── Left panel: Frontier ──────────────────────────────────────────────
  const leftWidth = Math.max(28, Math.floor(w * 0.3));

  // Build the ordered list of selectable quest IDs (shared with DashboardApp j/k navigation)
  const selectableIds = roadmapQuestIds(snap);
  const selectedQuestId = selectableIds[model.roadmap.table.focusRow] ?? null;

  function renderFrontierPanel(_pw: number, ph: number): string {
    const lines: string[] = [];
    let selectedLine = -1;

    // Drawer header (item 7)
    lines.push(style.styled(style.theme.semantic.info, '\u2500\u2500 Frontier \u2500\u2500'));
    lines.push('');

    if (hasDeps) {
      lines.push(style.styled(style.theme.semantic.primary, ' \u25B6 Ready'));
      lines.push('');

      if (frontier.length === 0) {
        lines.push(style.styled(style.theme.semantic.muted, '  (all tasks blocked)'));
      } else {
        for (const id of frontier) {
          const q = questMap.get(id);
          if (!q) continue;
          const icon = statusIcon(q.status);
          const mark = critSet.has(id) ? style.styled(style.theme.semantic.warning, ' \u2605') : '';
          if (id === selectedQuestId) selectedLine = lines.length;
          const sel = id === selectedQuestId ? style.styled(style.theme.semantic.primary, '\u25B6') : ' ';
          const titleStyle = id === selectedQuestId
            ? style.styled(style.theme.semantic.primary, q.title.slice(0, leftWidth - 15))
            : q.title.slice(0, leftWidth - 15);
          lines.push(`${sel}${icon} ${style.styledStatus(q.status, q.status.padEnd(4))} ${titleStyle}${mark}`);
        }
      }

      // Top Blockers section
      if (topBlockers.length > 0) {
        lines.push('');
        lines.push(style.styled(style.theme.semantic.error, ' \u26A1 Top Blockers'));
        lines.push('');
        for (const b of topBlockers) {
          const q = questMap.get(b.id);
          const shortId = b.id.replace('task:', '');
          const title = q ? q.title.slice(0, leftWidth - 20) : shortId;
          if (b.id === selectedQuestId) selectedLine = lines.length;
          const sel = b.id === selectedQuestId ? style.styled(style.theme.semantic.primary, '\u25B6') : ' ';
          lines.push(`${sel}${style.styled(style.theme.semantic.error, shortId.slice(0, 14).padEnd(14))} ${style.styled(style.theme.semantic.muted, `\u2193${b.transitiveCount}`)}`);
          lines.push(`   ${style.styled(style.theme.semantic.muted, title)}`);
        }
      }

      // Blocked section
      const blockedIds = [...blockedBy.keys()].sort();
      if (blockedIds.length > 0) {
        lines.push('');
        lines.push(style.styled(style.theme.semantic.error, ' \u2718 Blocked'));
        lines.push('');
        for (const id of blockedIds) {
          const q = questMap.get(id);
          if (!q) continue;
          const deps = blockedBy.get(id) ?? [];
          if (id === selectedQuestId) selectedLine = lines.length;
          const sel = id === selectedQuestId ? style.styled(style.theme.semantic.primary, '\u25B6') : ' ';
          const titleStyle = id === selectedQuestId
            ? style.styled(style.theme.semantic.primary, q.title.slice(0, leftWidth - 11))
            : q.title.slice(0, leftWidth - 11);
          lines.push(`${sel}${style.styled(style.theme.semantic.muted, '\u25CB')} ${titleStyle}`);
          lines.push(`   ${style.styled(style.theme.semantic.muted, `waits on ${deps.length} task(s)`)}`);
        }
      }
    } else {
      // No dependencies — group by status
      lines.push(style.styled(style.theme.semantic.primary, ' Quests'));
      lines.push('');

      const byStatus = new Map<string, typeof snap.quests>();
      for (const q of snap.quests) {
        if (q.status === 'DONE') continue;
        const arr = byStatus.get(q.status) ?? [];
        arr.push(q);
        byStatus.set(q.status, arr);
      }

      for (const [status, quests] of byStatus) {
        lines.push(` ${style.styledStatus(status)}`);
        for (const q of quests) {
          if (q.id === selectedQuestId) selectedLine = lines.length;
          const sel = q.id === selectedQuestId ? style.styled(style.theme.semantic.primary, '\u25B6') : ' ';
          const titleStyle = q.id === selectedQuestId
            ? style.styled(style.theme.semantic.primary, q.title.slice(0, leftWidth - 9))
            : q.title.slice(0, leftWidth - 9);
          lines.push(` ${sel}${statusIcon(q.status)} ${titleStyle}`);
        }
        lines.push('');
      }

      // Done count
      const doneCount = snap.quests.filter(q => q.status === 'DONE').length;
      if (doneCount > 0) {
        lines.push(style.styled(style.theme.semantic.success, ` \u2713 ${doneCount} done`));
      }
    }

    const content = lines.join('\n');
    // Auto-scroll to keep selected item visible (item 1)
    const scrollY = selectedLine >= 0
      ? Math.max(0, selectedLine - Math.floor(ph / 2))
      : 0;
    if (ph > 0) {
      return viewport({ width: _pw, height: ph, content, scrollY });
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
        borderToken: style.theme.border.primary,
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
        lines.push(style.styled(style.theme.ui.sectionHeader, `  ${heading}`));
        for (const q of quests) {
          lines.push(`  ${statusIcon(q.status)} ${style.styled(style.theme.semantic.muted, q.id.slice(0, 16))}  ${q.title.slice(0, 40)}  ${style.styledStatus(q.status)}`);
        }
      }

      return viewport({
        width: pw,
        height: ph,
        content: lines.join('\n'),
        scrollY: model.roadmap.fallbackScrollY,
      });
    }

    if (!model.roadmap.dagPane) {
      return style.styled(style.theme.semantic.muted, '  Loading DAG...');
    }
    return dagPane(model.roadmap.dagPane, { focused: true, ctx: getDefaultContext() });
  }

  // ── Detail content (for drawer overlay) ────────────────────────────
  function renderDetailContent(questId: string, pw: number): string {
    const q = questMap.get(questId);
    if (!q) return style.styled(style.theme.semantic.muted, '  Quest not found.');

    const lines: string[] = [];
    lines.push(style.styled(style.theme.semantic.primary, ` ${q.id}`));
    lines.push(` ${q.title.slice(0, pw - 2)}`);
    lines.push('');
    lines.push(` Status: ${style.styledStatus(q.status)}`);
    if (q.hours !== undefined) lines.push(` Hours:  ${q.hours}`);
    if (q.assignedTo) lines.push(` Owner:  ${q.assignedTo}`);

    // Campaign
    if (q.campaignId) {
      const cTitle = snap.campaigns.find(c => c.id === q.campaignId)?.title ?? q.campaignId;
      lines.push(` Campaign: ${cTitle.slice(0, pw - 12)}`);
    }

    // Intent
    if (q.intentId) {
      lines.push(` Intent: ${q.intentId}`);
    }

    // Dependencies
    const deps = q.dependsOn ?? [];
    if (deps.length > 0) {
      lines.push('');
      lines.push(style.styled(style.theme.semantic.info, ` Deps (${deps.length})`));
      for (const depId of deps) {
        const depQ = questMap.get(depId);
        const icon = depQ ? statusIcon(depQ.status) : '?';
        const depTitle = depQ ? depQ.title.slice(0, pw - 6) : depId;
        lines.push(` ${icon} ${depTitle}`);
      }
    }

    // Submission status
    const sub = snap.submissions.find(s => s.questId === q.id);
    if (sub) {
      lines.push('');
      lines.push(` Sub: ${style.styledStatus(sub.status)}`);
      if (sub.tipPatchsetId) {
        lines.push(style.styled(style.theme.semantic.muted, ` tip: ${sub.tipPatchsetId.slice(0, pw - 7)}`));
      }
    }

    // Scroll
    const sc = snap.scrolls.find(s => s.questId === q.id);
    if (sc) {
      lines.push('');
      lines.push(style.styled(style.theme.semantic.success, ` \u2713 Scroll: ${sc.id.slice(0, pw - 12)}`));
    }

    // Apply scroll offset by slicing content lines
    const allLines = lines.join('\n').split('\n');
    const scrolled = allLines.slice(model.roadmap.detailScrollY);
    return scrolled.join('\n');
  }

  // ── Vertical separator (item 7) ────────────────────────────────────
  function renderSeparator(_pw: number, ph: number): string {
    const sep = style.styled(style.theme.semantic.muted, '\u2502');
    return Array.from({ length: ph }, () => sep).join('\n');
  }

  // ── Compose layout ─────────────────────────────────────────────────────
  const base = flex(
    { direction: 'row', width: w, height: h },
    { basis: leftWidth, content: renderFrontierPanel },
    { basis: 1, content: renderSeparator },
    { flex: 1, content: renderDagPanel },
  );

  if (selectedQuestId === null) return base;

  const preferredDetailW = Math.min(40, Math.max(28, Math.floor(w * 0.3)));
  const detailW = Math.min(preferredDetailW, Math.max(1, w - 1));
  const detailContent = renderDetailContent(selectedQuestId, detailW);
  const panel = drawer({
    content: detailContent,
    anchor: 'right',
    width: detailW,
    screenWidth: w,
    screenHeight: h,
    title: selectedQuestId,
    borderToken: style.theme.border.primary,
  });
  return composite(base, [panel]);
}
