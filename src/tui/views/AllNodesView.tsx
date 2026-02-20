import type { ReactElement } from 'react';
import { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput, useStdout, type Key } from 'ink';
import type { GraphSnapshot, QuestNode } from '../../domain/models/dashboard.js';
import { STATUS_COLOR } from '../status-colors.js';
import { Scrollbar } from '../Scrollbar.js';
import { QuestDetailPanel } from '../QuestDetailPanel.js';

const CHROME_LINES = 3; // tab bar + marginBottom + scroll indicator

type VRow =
  | { kind: 'spacer' }
  | { kind: 'header'; label: string }
  | { kind: 'campaign'; id: string; title: string; status: string }
  | { kind: 'intent'; id: string; title: string; requestedBy: string }
  | { kind: 'quest'; id: string; title: string; status: string; hours: number; hasScroll: boolean; questIdx: number }
  | { kind: 'scroll'; id: string; questId: string; sealedBy: string; hasSeal: boolean }
  | { kind: 'approval'; id: string; status: string; trigger: string; approver: string };

interface Props {
  snapshot: GraphSnapshot;
  isActive: boolean;
}

function StatusText({ status }: { status: string }): ReactElement {
  const color = STATUS_COLOR[status] ?? 'white';
  return <Text color={color}>{status}</Text>;
}

function buildRows(snapshot: GraphSnapshot): { vrows: VRow[]; flatQuests: QuestNode[]; questCount: number } {
  const rows: VRow[] = [];
  const flatQuests: QuestNode[] = [];
  let first = true;
  let questIdx = 0;

  function pushSection(label: string, items: VRow[]): void {
    if (!first) rows.push({ kind: 'spacer' });
    first = false;
    rows.push({ kind: 'header', label });
    for (const item of items) rows.push(item);
  }

  if (snapshot.campaigns.length > 0) {
    pushSection(`Campaigns / Milestones  ${snapshot.campaigns.length}`, snapshot.campaigns.map(c => ({
      kind: 'campaign' as const, id: c.id, title: c.title, status: c.status,
    })));
  }

  if (snapshot.intents.length > 0) {
    pushSection(`Intents  ${snapshot.intents.length}`, snapshot.intents.map(intent => ({
      kind: 'intent' as const, id: intent.id, title: intent.title, requestedBy: intent.requestedBy,
    })));
  }

  if (snapshot.quests.length > 0) {
    pushSection(`Quests  ${snapshot.quests.length}`, snapshot.quests.map(q => {
      const row: VRow = {
        kind: 'quest' as const, id: q.id, title: q.title, status: q.status,
        hours: q.hours, hasScroll: q.scrollId !== undefined, questIdx: questIdx++,
      };
      flatQuests.push(q);
      return row;
    }));
  }

  if (snapshot.scrolls.length > 0) {
    pushSection(`Scrolls  ${snapshot.scrolls.length}`, snapshot.scrolls.map(s => ({
      kind: 'scroll' as const, id: s.id, questId: s.questId, sealedBy: s.sealedBy, hasSeal: s.hasSeal,
    })));
  }

  if (snapshot.approvals.length > 0) {
    pushSection(`Approval Gates  ${snapshot.approvals.length}`, snapshot.approvals.map(a => ({
      kind: 'approval' as const, id: a.id, status: a.status, trigger: a.trigger, approver: a.approver,
    })));
  }

  return { vrows: rows, flatQuests, questCount: questIdx };
}

export function AllNodesView({ snapshot, isActive }: Props): ReactElement {
  const { stdout } = useStdout();
  const listHeight = Math.max(4, (stdout.rows ?? 24) - CHROME_LINES);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [selectedQuestIdx, setSelectedQuestIdx] = useState(0);
  const [showDetail, setShowDetail] = useState(false);

  const { vrows, flatQuests, questCount } = useMemo(() => buildRows(snapshot), [snapshot]);
  const total = snapshot.campaigns.length + snapshot.quests.length +
    snapshot.intents.length + snapshot.scrolls.length + snapshot.approvals.length;

  // Find vrow indices for quest rows
  const questVIndices = vrows
    .map((r, i) => (r.kind === 'quest' ? i : -1))
    .filter((i) => i >= 0);

  const clampedQuestIdx =
    questCount === 0 ? 0 : Math.min(selectedQuestIdx, questCount - 1);

  // The vrow index for the selected quest
  const selectedVIdx = questVIndices[clampedQuestIdx] ?? -1;

  const maxOffset = Math.max(0, vrows.length - listHeight);
  const clampedOffset = Math.min(scrollOffset, maxOffset);

  useEffect(() => {
    setSelectedQuestIdx(prev => questCount === 0 ? 0 : Math.min(prev, questCount - 1));
  }, [questCount]);

  function moveSelection(delta: number): void {
    if (questCount === 0) return;
    const next = Math.max(0, Math.min(questCount - 1, clampedQuestIdx + delta));
    const nextVIdx = questVIndices[next] ?? -1;
    if (nextVIdx >= 0) {
      if (nextVIdx < clampedOffset) {
        setScrollOffset(nextVIdx);
      } else if (nextVIdx >= clampedOffset + listHeight) {
        setScrollOffset(nextVIdx - listHeight + 1);
      }
    }
    setSelectedQuestIdx(next);
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
    if (input === ' ' && questCount > 0) {
      setShowDetail(true);
    }
  }, { isActive });

  // Detail modal — use flatQuests for correct lookup
  if (showDetail) {
    const selectedQuest = flatQuests[clampedQuestIdx] ?? null;
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

  if (total === 0) {
    return <Text dimColor>Graph is empty. Start with: xyph-actuator intent ...</Text>;
  }

  const visibleRows = vrows.slice(clampedOffset, clampedOffset + listHeight);

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Box flexDirection="column" flexGrow={1}>
        {visibleRows.map((row, i) => {
          const absIdx = clampedOffset + i;
          if (row.kind === 'spacer') {
            return <Box key={`sp-${clampedOffset + i}`}><Text> </Text></Box>;
          }
          if (row.kind === 'header') {
            return (
              <Box key={`h-${row.label}`}>
                <Text bold color="green">{row.label}</Text>
              </Box>
            );
          }
          if (row.kind === 'campaign') {
            return (
              <Box key={row.id} marginLeft={2}>
                <Text dimColor>{row.id.padEnd(22)}</Text>
                <Text>{row.title.slice(0, 38).padEnd(40)}</Text>
                <StatusText status={row.status} />
              </Box>
            );
          }
          if (row.kind === 'intent') {
            return (
              <Box key={row.id} marginLeft={2}>
                <Text dimColor>{row.id.padEnd(22)}</Text>
                <Text>{row.title.slice(0, 36).padEnd(38)}</Text>
                <Text dimColor>{row.requestedBy}</Text>
              </Box>
            );
          }
          if (row.kind === 'quest') {
            const isSelected = absIdx === selectedVIdx;
            return (
              <Box key={row.id} marginLeft={2}>
                <Box width={2}>
                  <Text color="cyan">{isSelected ? '▶' : ' '}</Text>
                </Box>
                <Text dimColor>{row.id.slice(0, 18).padEnd(20)}</Text>
                <Text bold={isSelected}>{row.title.slice(0, 30).padEnd(32)}</Text>
                <StatusText status={row.status} />
                <Text dimColor>  {row.hours}h</Text>
                {row.hasScroll && <Text color="green">  ✓</Text>}
              </Box>
            );
          }
          if (row.kind === 'scroll') {
            return (
              <Box key={row.id} marginLeft={2}>
                <Text dimColor>{row.id.slice(0, 24).padEnd(26)}</Text>
                <Text dimColor>{row.questId.slice(0, 18).padEnd(20)}</Text>
                <Text dimColor>{row.sealedBy.padEnd(16)}</Text>
                <Text color={row.hasSeal ? 'green' : 'yellow'}>
                  {row.hasSeal ? '⊕ sealed' : '○ unsigned'}
                </Text>
              </Box>
            );
          }
          return (
            <Box key={row.id} marginLeft={2}>
              <Text dimColor>{row.id.slice(0, 18).padEnd(20)}</Text>
              <StatusText status={row.status} />
              <Text dimColor>  {row.trigger}</Text>
              <Text dimColor>  approver: {row.approver}</Text>
            </Box>
          );
        })}
        </Box>
        <Scrollbar total={vrows.length} visible={listHeight} offset={clampedOffset} />
      </Box>
      <Text dimColor>
        {'  '}{total} nodes
        {questCount > 0 ? `  quest ${clampedQuestIdx + 1}/${questCount}` : ''}
        {vrows.length > listHeight
          ? `  rows ${clampedOffset + 1}–${Math.min(clampedOffset + listHeight, vrows.length)}/${vrows.length}  ↑↓  Space: quest detail`
          : '  ↑↓  Space: quest detail'}
      </Text>
    </Box>
  );
}
