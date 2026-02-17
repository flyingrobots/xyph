import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useStdout, type Key } from 'ink';
import type { GraphSnapshot, QuestNode } from '../../domain/models/dashboard.js';

const DETAIL_LINES = 8;  // lines reserved for detail panel + border
const CHROME_LINES = 3;  // tab bar + scroll indicator + margin

const STATUS_COLOR: Record<string, string> = {
  DONE: 'green',
  IN_PROGRESS: 'cyan',
  BACKLOG: 'gray',
  BLOCKED: 'red',
  PLANNED: 'yellow',
};

type StatusColor = 'green' | 'cyan' | 'gray' | 'red' | 'yellow' | 'white';

type VRow =
  | { kind: 'spacer' }
  | { kind: 'header'; label: string }
  | { kind: 'quest'; quest: QuestNode; flatIdx: number };

interface Props {
  snapshot: GraphSnapshot;
  isActive: boolean;
}

export function RoadmapView({ snapshot, isActive }: Props): React.ReactElement {
  const { stdout } = useStdout();
  const listHeight = Math.max(4, (stdout.rows ?? 24) - DETAIL_LINES - CHROME_LINES);

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  // ── Build virtual row list ────────────────────────────────────────────────

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
    vrows.push({ kind: 'header', label: campaignTitle.get(key) ?? key });
    for (const q of grouped.get(key) ?? []) {
      vrows.push({ kind: 'quest', quest: q, flatIdx: flatQuests.length });
      flatQuests.push(q);
    }
  }

  const totalQuests = flatQuests.length;

  // ── Clamp state when snapshot data changes ───────────────────────────────
  // Uses functional updater to avoid stale-closure issues.
  useEffect(() => {
    setSelectedIdx((prev) =>
      totalQuests === 0 ? 0 : Math.min(prev, totalQuests - 1)
    );
    setScrollOffset((prev) =>
      Math.min(prev, Math.max(0, vrows.length - listHeight))
    );
  }, [totalQuests, vrows.length, listHeight]);

  // ── Clamped rendering values (guards the one-render lag before effect fires)
  const clampedIdx =
    totalQuests === 0 ? 0 : Math.min(selectedIdx, totalQuests - 1);
  const clampedOffset = Math.min(
    scrollOffset,
    Math.max(0, vrows.length - listHeight)
  );

  // ── Navigation ────────────────────────────────────────────────────────────
  function moveSelection(delta: number): void {
    if (totalQuests === 0) return;
    const next = Math.max(0, Math.min(totalQuests - 1, clampedIdx + delta));
    const vIdx = vrows.findIndex(
      (r) => r.kind === 'quest' && r.flatIdx === next
    );
    if (vIdx >= 0) {
      if (vIdx < clampedOffset) {
        setScrollOffset(vIdx);
      } else if (vIdx >= clampedOffset + listHeight) {
        setScrollOffset(vIdx - listHeight + 1);
      }
    }
    setSelectedIdx(next);
  }

  useInput((_input: string, key: Key) => {
    if (key.upArrow) moveSelection(-1);
    if (key.downArrow) moveSelection(1);
  }, { isActive });

  // ── Empty state ───────────────────────────────────────────────────────────
  if (totalQuests === 0) {
    return (
      <Box flexDirection="column">
        <Text dimColor>No tasks in the roadmap yet.</Text>
        <Box
          borderStyle="round"
          borderColor="gray"
          marginTop={1}
          paddingX={1}
        >
          <Text dimColor>(no task selected)</Text>
        </Box>
      </Box>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const selectedQuest: QuestNode | null = flatQuests[clampedIdx] ?? null;
  const visibleRows = vrows.slice(clampedOffset, clampedOffset + listHeight);

  return (
    <Box flexDirection="column">
      {/* Scrollable quest list */}
      <Box flexDirection="column">
        {visibleRows.map((row, i) => {
          if (row.kind === 'spacer') {
            return <Box key={`sp-${i}`}><Text> </Text></Box>;
          }
          if (row.kind === 'header') {
            return (
              <Box key={`h-${row.label}`}>
                <Text bold color="blue">
                  {row.label}
                </Text>
              </Box>
            );
          }
          const q = row.quest;
          const isSelected = row.flatIdx === clampedIdx;
          const statusColor = (STATUS_COLOR[q.status] ?? 'white') as StatusColor;
          return (
            <Box key={q.id}>
              <Text color={isSelected ? 'cyan' : 'gray'}>
                {isSelected ? '▶ ' : '  '}
              </Text>
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

      {/* Scroll indicator */}
      <Text dimColor>
        {'  quest '}
        {clampedIdx + 1}/{totalQuests}
        {vrows.length > listHeight
          ? `  rows ${clampedOffset + 1}–${Math.min(clampedOffset + listHeight, vrows.length)}/${vrows.length}  ↑↓`
          : '  ↑↓'}
      </Text>

      {/* Detail panel */}
      {selectedQuest !== null && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="cyan"
          marginTop={1}
          paddingX={1}
        >
          <Box>
            <Text bold color="cyan">
              {selectedQuest.id}
              {'  '}
            </Text>
            <Text bold>{selectedQuest.title}</Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Status   </Text>
            <Text color={(STATUS_COLOR[selectedQuest.status] ?? 'white') as StatusColor}>
              {selectedQuest.status}
            </Text>
            <Text dimColor>   Hours  </Text>
            <Text>{selectedQuest.hours}h</Text>
            {selectedQuest.assignedTo !== undefined && (
              <>
                <Text dimColor>   Agent  </Text>
                <Text dimColor>{selectedQuest.assignedTo}</Text>
              </>
            )}
          </Box>
          {selectedQuest.campaignId !== undefined && (
            <Box>
              <Text dimColor>Campaign </Text>
              <Text dimColor>{selectedQuest.campaignId}</Text>
            </Box>
          )}
          {selectedQuest.intentId !== undefined && (
            <Box>
              <Text dimColor>Intent   </Text>
              <Text dimColor>{selectedQuest.intentId}</Text>
            </Box>
          )}
          {selectedQuest.scrollId !== undefined && (
            <Box>
              <Text dimColor>Scroll   </Text>
              <Text color="green">
                {selectedQuest.scrollId}{'  ✓'}
              </Text>
            </Box>
          )}
          {selectedQuest.completedAt !== undefined && (
            <Box>
              <Text dimColor>Completed</Text>
              <Text dimColor>
                {'  '}
                {new Date(selectedQuest.completedAt).toISOString()}
              </Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
