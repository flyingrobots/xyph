import { headerBox, dagLayout, type DagNode, type DagLayout } from '@flyingrobots/bijou';
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

  // Build the ordered list of selectable quest IDs matching frontier panel render order
  const selectableIds: string[] = hasDeps
    ? [...frontier, ...[...blockedBy.keys()].sort()]
    : snap.quests.filter(q => q.status !== 'DONE').map(q => q.id);
  const selectedQuestId = selectableIds[model.roadmap.selectedIndex] ?? null;

  function renderFrontierPanel(_pw: number, ph: number): string {
    const lines: string[] = [];
    let selectedLine = -1;

    // Drawer header (item 7)
    lines.push(styled(t.theme.semantic.info, '\u2500\u2500 Frontier \u2500\u2500'));
    lines.push('');

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
          if (id === selectedQuestId) selectedLine = lines.length;
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
          if (id === selectedQuestId) selectedLine = lines.length;
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
          if (q.id === selectedQuestId) selectedLine = lines.length;
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
      token: q.id === selectedQuestId
        ? t.theme.semantic.primary
        : critSet.has(q.id) ? t.theme.semantic.warning : undefined,
    }));

    const layout: DagLayout = dagLayout(dagNodes, {
      highlightPath: criticalPath.length > 1 ? criticalPath : undefined,
      highlightToken: t.theme.semantic.warning,
      selectedId: selectedQuestId ?? undefined,
      selectedToken: t.theme.semantic.primary,
      direction: 'right',
      maxWidth: Math.max(pw * 2, 120), // allow wider graph, scroll handles it
    });

    // Auto-center on selected node, with manual offset
    let scrollX = model.roadmap.dagScrollX;
    let scrollY = model.roadmap.dagScrollY;
    if (selectedQuestId) {
      const nodePos = layout.nodes.get(selectedQuestId);
      if (nodePos) {
        // Center the selected node in the viewport; manual scroll offsets from auto-center
        scrollX = Math.max(0, nodePos.col - Math.floor(pw / 2)) + model.roadmap.dagScrollX;
        scrollY = Math.max(0, nodePos.row - Math.floor(ph / 2));
      }
    }

    return viewport({
      width: pw,
      height: ph,
      content: layout.output,
      scrollY,
      scrollX,
    });
  }

  // ── Right panel: Detail ─────────────────────────────────────────────
  const detailWidth = 28;

  function renderDetailPanel(pw: number, ph: number): string {
    if (!selectedQuestId) return '';
    const q = questMap.get(selectedQuestId);
    if (!q) return styled(t.theme.semantic.muted, '  Quest not found.');

    const lines: string[] = [];
    lines.push(styled(t.theme.semantic.primary, ` ${q.id}`));
    lines.push(` ${q.title.slice(0, pw - 2)}`);
    lines.push('');
    lines.push(` Status: ${styledStatus(q.status)}`);
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
      lines.push(styled(t.theme.semantic.info, ` Deps (${deps.length})`));
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
      lines.push(` Sub: ${styledStatus(sub.status)}`);
      if (sub.tipPatchsetId) {
        lines.push(styled(t.theme.semantic.muted, ` tip: ${sub.tipPatchsetId.slice(0, pw - 7)}`));
      }
    }

    // Scroll
    const sc = snap.scrolls.find(s => s.questId === q.id);
    if (sc) {
      lines.push('');
      lines.push(styled(t.theme.semantic.success, ` \u2713 Scroll: ${sc.id.slice(0, pw - 12)}`));
    }

    return viewport({ width: pw, height: ph, content: lines.join('\n'), scrollY: model.roadmap.detailScrollY });
  }

  // ── Vertical separator (item 7) ────────────────────────────────────
  function renderSeparator(_pw: number, ph: number): string {
    const sep = styled(t.theme.semantic.muted, '\u2502');
    return Array.from({ length: ph }, () => sep).join('\n');
  }

  // ── Compose layout ─────────────────────────────────────────────────────
  if (selectedQuestId !== null) {
    return flex(
      { direction: 'row', width: w, height: h },
      { basis: leftWidth, content: renderFrontierPanel },
      { basis: 1, content: renderSeparator },
      { flex: 1, content: renderDagPanel },
      { basis: detailWidth, content: renderDetailPanel },
    );
  }

  return flex(
    { direction: 'row', width: w, height: h },
    { basis: leftWidth, content: renderFrontierPanel },
    { basis: 1, content: renderSeparator },
    { flex: 1, content: renderDagPanel },
  );
}
