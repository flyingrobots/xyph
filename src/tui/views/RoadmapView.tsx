import type { ReactElement } from 'react';
import { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput, useStdout, type Key } from 'ink';
import type { GraphSnapshot, QuestNode } from '../../domain/models/dashboard.js';
import { STATUS_COLOR } from '../status-colors.js';
import { Scrollbar } from '../Scrollbar.js';
import { QuestDetailPanel } from '../QuestDetailPanel.js';

const CHROME_LINES = 3;  // tab bar + scroll indicator + margin

type VRow =
  | { kind: 'spacer' }
  | { kind: 'header'; label: string; campaignId: string }
  | { kind: 'quest'; quest: QuestNode; flatIdx: number };

interface Props {
  snapshot: GraphSnapshot;
  isActive: boolean;
}

function buildRows(
  snapshot: GraphSnapshot,
  foldedCampaigns: Set<string>,
): { vrows: VRow[]; flatQuests: QuestNode[] } {
  const campaignTitle = new Map<string, string>();
  for (const c of snapshot.campaigns) {
    campaignTitle.set(c.id, c.title);
  }

  const campaignOrder: string[] = [];
  const grouped = new Map<string, QuestNode[]>();
  for (const q of snapshot.quests) {
    const key = q.campaignId ?? '(no campaign)';
    if (!grouped.has(key)) {
      campaignOrder.push(key);
      grouped.set(key, []);
    }
    grouped.get(key)?.push(q);
  }

  const vrows: VRow[] = [];
  const flatQuests: QuestNode[] = [];

  for (const key of campaignOrder) {
    if (vrows.length > 0) vrows.push({ kind: 'spacer' });
    vrows.push({ kind: 'header', label: campaignTitle.get(key) ?? key, campaignId: key });

    if (!foldedCampaigns.has(key)) {
      for (const q of grouped.get(key) ?? []) {
        vrows.push({ kind: 'quest', quest: q, flatIdx: flatQuests.length });
        flatQuests.push(q);
      }
    }
  }

  return { vrows, flatQuests };
}

export function RoadmapView({ snapshot, isActive }: Props): ReactElement {
  const { stdout } = useStdout();
  const listHeight = Math.max(4, (stdout.rows ?? 24) - CHROME_LINES);

  const [foldedCampaigns, setFoldedCampaigns] = useState<Set<string>>(new Set());
  const [showDetail, setShowDetail] = useState(false);
  const [selectedVIdx, setSelectedVIdx] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  const { vrows, flatQuests } = useMemo(
    () => buildRows(snapshot, foldedCampaigns),
    [snapshot, foldedCampaigns],
  );
  const totalQuests = flatQuests.length;

  // Navigable indices: those that are not spacers
  const navigableIndices = vrows
    .map((r, i) => (r.kind !== 'spacer' ? i : -1))
    .filter((i) => i >= 0);

  // Clamp selectedVIdx to a valid navigable row
  const clampedVIdx =
    navigableIndices.length === 0
      ? 0
      : navigableIndices.includes(selectedVIdx)
        ? selectedVIdx
        : (navigableIndices[0] ?? 0);

  const clampedOffset = Math.min(
    scrollOffset,
    Math.max(0, vrows.length - listHeight),
  );

  // When foldedCampaigns changes, snap selectedVIdx to nearest navigable
  useEffect(() => {
    const navIndices = vrows
      .map((r, i) => (r.kind !== 'spacer' ? i : -1))
      .filter((i) => i >= 0);

    setSelectedVIdx((prev) => {
      if (navIndices.length === 0) return 0;
      if (navIndices.includes(prev)) return prev;
      // Find closest navigable
      let closest = navIndices[0] ?? 0;
      for (const ni of navIndices) {
        if (Math.abs(ni - prev) < Math.abs(closest - prev)) closest = ni;
      }
      return closest;
    });
  }, [vrows]);

  function moveSelection(delta: number): void {
    if (navigableIndices.length === 0) return;
    const curPos = navigableIndices.indexOf(clampedVIdx);
    const nextPos = Math.max(0, Math.min(navigableIndices.length - 1, curPos + delta));
    const nextVIdx = navigableIndices[nextPos] ?? 0;

    if (nextVIdx < clampedOffset) {
      setScrollOffset(nextVIdx);
    } else if (nextVIdx >= clampedOffset + listHeight) {
      setScrollOffset(nextVIdx - listHeight + 1);
    }
    setSelectedVIdx(nextVIdx);
  }

  useInput((input: string, key: Key) => {
    if (showDetail) {
      if (key.escape) setShowDetail(false);
      return;
    }
    if (key.upArrow) { moveSelection(-1); return; }
    if (key.downArrow) { moveSelection(1); return; }
    if (key.pageUp) { moveSelection(-listHeight); return; }
    if (key.pageDown) { moveSelection(listHeight); return; }
    if (input === ' ') {
      const row = vrows[clampedVIdx];
      if (row === undefined) return;
      if (row.kind === 'header') {
        setFoldedCampaigns((prev) => {
          const next = new Set(prev);
          if (next.has(row.campaignId)) {
            next.delete(row.campaignId);
          } else {
            next.add(row.campaignId);
          }
          return next;
        });
      } else if (row.kind === 'quest') {
        setShowDetail(true);
      }
    }
  }, { isActive });

  // Detail modal
  if (showDetail) {
    const row = vrows[clampedVIdx];
    const selectedQuest = row?.kind === 'quest' ? row.quest : null;
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="cyan">
        <Box paddingX={1} flexDirection="column">
          {selectedQuest !== null
            ? <QuestDetailPanel
                quest={selectedQuest}
                campaignTitle={selectedQuest.campaignId !== undefined ? (snapshot.campaigns.find(c => c.id === selectedQuest.campaignId)?.title ?? selectedQuest.campaignId) : undefined}
                intentTitle={selectedQuest.intentId !== undefined ? (snapshot.intents.find(i => i.id === selectedQuest.intentId)?.title ?? selectedQuest.intentId) : undefined}
              />
            : <Text dimColor>(no quest selected)</Text>
          }
        </Box>
        <Box paddingX={1}>
          <Text dimColor>Esc to close</Text>
        </Box>
      </Box>
    );
  }

  // Empty state
  if (totalQuests === 0) {
    return (
      <Box flexDirection="column">
        <Text dimColor>No tasks in the roadmap yet.</Text>
        <Box borderStyle="round" borderColor="gray" marginTop={1} paddingX={1}>
          <Text dimColor>(no task selected)</Text>
        </Box>
      </Box>
    );
  }

  const visibleRows = vrows.slice(clampedOffset, clampedOffset + listHeight);

  // Extract flatIdx from clamped row for scroll indicator
  const clampedRow = vrows[clampedVIdx];
  const questIndicator = clampedRow?.kind === 'quest'
    ? String(clampedRow.flatIdx + 1)
    : '—';

  return (
    <Box flexDirection="column">
      {/* Scrollable list + scrollbar */}
      <Box flexDirection="row">
        <Box flexDirection="column" flexGrow={1}>
          {visibleRows.map((row, i) => {
            const absIdx = clampedOffset + i;
            if (row.kind === 'spacer') {
              return <Box key={`sp-${clampedOffset + i}`}><Text> </Text></Box>;
            }
            if (row.kind === 'header') {
              const isSelected = absIdx === clampedVIdx;
              const isFolded = foldedCampaigns.has(row.campaignId);
              return (
                <Box key={`h-${row.campaignId}`}>
                  <Box width={2}>
                    <Text color="cyan">{isSelected ? '▶' : ' '}</Text>
                  </Box>
                  <Text bold color="blue">
                    {isFolded ? '▶ ' : '▼ '}
                    {row.label}
                  </Text>
                </Box>
              );
            }
            const q = row.quest;
            const isSelected = absIdx === clampedVIdx;
            const statusColor = STATUS_COLOR[q.status] ?? 'white';
            return (
              <Box key={q.id}>
                <Box width={2}>
                  <Text color="cyan">{isSelected ? '▶' : ''}</Text>
                </Box>
                <Text bold={isSelected} color={isSelected ? undefined : 'gray'}>
                  {q.id.slice(0, 16).padEnd(18)}
                </Text>
                <Text bold={isSelected}>{q.title.slice(0, 36).padEnd(38)}</Text>
                <Text color={statusColor}>
                  {'  ' + q.status.padEnd(12)}
                </Text>
                <Text dimColor>{String(q.hours).padStart(3)}h</Text>
                {q.scrollId !== undefined && <Text color="green">  ✓</Text>}
              </Box>
            );
          })}
        </Box>
        <Scrollbar total={vrows.length} visible={listHeight} offset={clampedOffset} />
      </Box>

      {/* Scroll indicator */}
      <Text dimColor>
        {'  quest '}
        {totalQuests === 0 ? '0/0' : `${questIndicator}/${totalQuests}`}
        {vrows.length > listHeight
          ? `  rows ${clampedOffset + 1}–${Math.min(clampedOffset + listHeight, vrows.length)}/${vrows.length}  ↑↓  Space: fold/detail`
          : '  ↑↓  Space: fold/detail'}
      </Text>
    </Box>
  );
}
