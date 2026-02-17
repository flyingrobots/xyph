import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useStdout, type Key } from 'ink';
import type { GraphSnapshot } from '../../domain/models/dashboard.js';
import { Scrollbar } from '../Scrollbar.js';

const CHROME_LINES = 3; // tab bar + marginBottom + scroll indicator

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
  | { kind: 'intent-header'; id: string; title: string }
  | { kind: 'intent-meta'; requestedBy: string }
  | { kind: 'quest'; id: string; title: string; status: string; branch: string; scrollId: string | undefined; sealed: boolean }
  | { kind: 'scroll-sub'; scrollId: string }
  | { kind: 'orphan-header' }
  | { kind: 'orphan'; id: string; title: string };

interface Props {
  snapshot: GraphSnapshot;
  isActive: boolean;
}

function buildRows(snapshot: GraphSnapshot): VRow[] {
  const scrollByQuestId = new Map<string, string>();
  const scrollHasSeal = new Map<string, boolean>();
  for (const s of snapshot.scrolls) {
    scrollByQuestId.set(s.questId, s.id);
    scrollHasSeal.set(s.questId, s.hasSeal);
  }

  const questsByIntent = new Map<string, typeof snapshot.quests>();
  for (const q of snapshot.quests) {
    if (q.intentId !== undefined) {
      const arr = questsByIntent.get(q.intentId) ?? [];
      arr.push(q);
      questsByIntent.set(q.intentId, arr);
    }
  }

  // INBOX tasks genuinely lack an intent (not yet promoted) — exclude from orphan list
  const orphans = snapshot.quests.filter(
    (q) => q.intentId === undefined && q.status !== 'INBOX'
  );
  const rows: VRow[] = [];
  let first = true;

  for (const intent of snapshot.intents) {
    if (!first) rows.push({ kind: 'spacer' });
    first = false;

    rows.push({ kind: 'intent-header', id: intent.id, title: intent.title });
    rows.push({ kind: 'intent-meta', requestedBy: intent.requestedBy });

    const quests = questsByIntent.get(intent.id) ?? [];
    if (quests.length === 0) {
      rows.push({ kind: 'quest', id: '', title: '(no quests)', status: '', branch: '└─', scrollId: undefined, sealed: false });
    } else {
      for (let i = 0; i < quests.length; i++) {
        const q = quests[i];
        if (q === undefined) continue;
        const branch = i === quests.length - 1 ? '└─' : '├─';
        const scrollId = scrollByQuestId.get(q.id);
        const sealed = scrollHasSeal.get(q.id) ?? false;
        rows.push({ kind: 'quest', id: q.id, title: q.title, status: q.status, branch, scrollId, sealed });
        if (scrollId !== undefined) {
          rows.push({ kind: 'scroll-sub', scrollId });
        }
      }
    }
  }

  if (orphans.length > 0) {
    if (!first) rows.push({ kind: 'spacer' });
    rows.push({ kind: 'orphan-header' });
    for (const q of orphans) {
      rows.push({ kind: 'orphan', id: q.id, title: q.title });
    }
  }

  return rows;
}

export function LineageView({ snapshot, isActive }: Props): React.ReactElement {
  const { stdout } = useStdout();
  const listHeight = Math.max(4, (stdout.rows ?? 24) - CHROME_LINES);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [selectedVIdx, setSelectedVIdx] = useState(0);

  const vrows = buildRows(snapshot);
  const maxOffset = Math.max(0, vrows.length - listHeight);
  const clampedOffset = Math.min(scrollOffset, maxOffset);

  // Navigable quest row indices
  const questIndices = vrows
    .map((r, i) => (r.kind === 'quest' && r.id !== '' ? i : -1))
    .filter((i) => i >= 0);

  const clampedVIdx =
    questIndices.length === 0
      ? 0
      : questIndices.includes(selectedVIdx)
        ? selectedVIdx
        : (questIndices[0] ?? 0);

  useEffect(() => {
    setScrollOffset(prev => Math.min(prev, Math.max(0, vrows.length - listHeight)));
  }, [vrows.length, listHeight]);

  function moveSelection(delta: number): void {
    if (questIndices.length === 0) return;
    const curPos = questIndices.indexOf(clampedVIdx);
    const nextPos = Math.max(0, Math.min(questIndices.length - 1, curPos + delta));
    const nextVIdx = questIndices[nextPos] ?? 0;

    if (nextVIdx < clampedOffset) {
      setScrollOffset(nextVIdx);
    } else if (nextVIdx >= clampedOffset + listHeight) {
      setScrollOffset(nextVIdx - listHeight + 1);
    }
    setSelectedVIdx(nextVIdx);
  }

  useInput((_input: string, key: Key) => {
    if (key.upArrow) moveSelection(-1);
    if (key.downArrow) moveSelection(1);
  }, { isActive });

  if (snapshot.intents.length === 0) {
    return (
      <Box flexDirection="column">
        <Text bold color="magenta">Genealogy of Intent</Text>
        <Text dimColor>
          No intents declared yet. Use: xyph-actuator intent {'<id>'} --title {'"..."'} --requested-by human.{'<name>'}
        </Text>
      </Box>
    );
  }

  const visibleRows = vrows.slice(clampedOffset, clampedOffset + listHeight);

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Box flexDirection="column" flexGrow={1}>
        {visibleRows.map((row, i) => {
          const absIdx = clampedOffset + i;
          if (row.kind === 'spacer') {
            return <Box key={`sp-${i}`}><Text> </Text></Box>;
          }
          if (row.kind === 'intent-header') {
            return (
              <Box key={`ih-${row.id}`}>
                <Text bold color="magenta">{'◆ ' + row.id}</Text>
                <Text dimColor>  {row.title}</Text>
              </Box>
            );
          }
          if (row.kind === 'intent-meta') {
            return (
              <Box key={`im-${i}`}>
                <Text dimColor>  requested-by: {row.requestedBy}</Text>
              </Box>
            );
          }
          if (row.kind === 'quest') {
            if (row.id === '') {
              return (
                <Box key={`q-empty-${i}`} marginLeft={2}>
                  <Text dimColor>{row.branch} {row.title}</Text>
                </Box>
              );
            }
            const isSelected = absIdx === clampedVIdx;
            const statusColor = (STATUS_COLOR[row.status] ?? 'white') as StatusColor;
            return (
              <Box key={`q-${row.id}`} marginLeft={2}>
                <Box width={2}>
                  <Text color="cyan">{isSelected ? '▶' : ' '}</Text>
                </Box>
                <Text dimColor>{row.branch} </Text>
                <Text dimColor>{row.id.slice(0, 16)}  </Text>
                <Text bold={isSelected}>{row.title.slice(0, 36)}  </Text>
                <Text color={statusColor}>{'[' + row.status + ']'}</Text>
                {row.scrollId !== undefined && (
                  <Text color={row.sealed ? 'green' : 'yellow'}>
                    {row.sealed ? '  ✓' : '  ○'}
                  </Text>
                )}
              </Box>
            );
          }
          if (row.kind === 'scroll-sub') {
            return (
              <Box key={`s-${row.scrollId}`} marginLeft={5}>
                <Text dimColor>scroll: {row.scrollId}</Text>
              </Box>
            );
          }
          if (row.kind === 'orphan-header') {
            return (
              <Box key="orphan-header">
                <Text bold color="red">⚠ Orphan quests (sovereignty violation)</Text>
              </Box>
            );
          }
          return (
            <Box key={`o-${row.id}`} marginLeft={2}>
              <Text dimColor>└─ {row.id}  </Text>
              <Text>{row.title.slice(0, 38)}</Text>
            </Box>
          );
        })}
        </Box>
        <Scrollbar total={vrows.length} visible={listHeight} offset={clampedOffset} />
      </Box>
      <Text dimColor>
        {'  '}{snapshot.intents.length} intents · {snapshot.quests.length} quests
        {vrows.length > listHeight
          ? `  rows ${clampedOffset + 1}–${Math.min(clampedOffset + listHeight, vrows.length)}/${vrows.length}  ↑↓`
          : '  ↑↓'}
      </Text>
    </Box>
  );
}
