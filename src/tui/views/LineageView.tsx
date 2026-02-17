import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useStdout, type Key } from 'ink';
import type { GraphSnapshot } from '../../domain/models/dashboard.js';

const CHROME_LINES = 2; // tab bar + scroll indicator

const STATUS_COLOR: Record<string, string> = {
  DONE: 'green',
  IN_PROGRESS: 'cyan',
  BACKLOG: 'gray',
  BLOCKED: 'red',
  PLANNED: 'yellow',
};

type StatusColor = 'green' | 'cyan' | 'gray' | 'red' | 'yellow' | 'white';

type VRow =
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

export function LineageView({ snapshot, isActive }: Props): React.ReactElement {
  const { stdout } = useStdout();
  const listHeight = Math.max(4, (stdout.rows ?? 24) - CHROME_LINES);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Build lookup maps
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

  const orphans = snapshot.quests.filter((q) => q.intentId === undefined);

  // Flatten tree into virtual rows
  const vrows: VRow[] = [];

  for (const intent of snapshot.intents) {
    vrows.push({ kind: 'intent-header', id: intent.id, title: intent.title });
    vrows.push({ kind: 'intent-meta', requestedBy: intent.requestedBy });

    const quests = questsByIntent.get(intent.id) ?? [];
    if (quests.length === 0) {
      vrows.push({ kind: 'quest', id: '', title: '(no quests)', status: '', branch: '└─', scrollId: undefined, sealed: false });
    } else {
      for (let i = 0; i < quests.length; i++) {
        const q = quests[i];
        if (q === undefined) continue;
        const branch = i === quests.length - 1 ? '└─' : '├─';
        const scrollId = scrollByQuestId.get(q.id);
        const sealed = scrollHasSeal.get(q.id) ?? false;
        vrows.push({ kind: 'quest', id: q.id, title: q.title, status: q.status, branch, scrollId, sealed });
        if (scrollId !== undefined) {
          vrows.push({ kind: 'scroll-sub', scrollId });
        }
      }
    }
  }

  if (orphans.length > 0) {
    vrows.push({ kind: 'orphan-header' });
    for (const q of orphans) {
      vrows.push({ kind: 'orphan', id: q.id, title: q.title });
    }
  }

  const clampedOffset = Math.min(scrollOffset, Math.max(0, vrows.length - listHeight));

  useEffect(() => {
    setScrollOffset(prev => Math.min(prev, Math.max(0, vrows.length - listHeight)));
  }, [vrows.length, listHeight]);

  useInput((_input: string, key: Key) => {
    if (key.upArrow) setScrollOffset(prev => Math.max(0, prev - 1));
    if (key.downArrow) setScrollOffset(prev => Math.min(Math.max(0, vrows.length - listHeight), prev + 1));
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
      <Box flexDirection="column">
        {visibleRows.map((row, i) => {
          if (row.kind === 'intent-header') {
            return (
              <Box key={`ih-${row.id}`} marginTop={i > 0 ? 1 : 0}>
                <Text bold color="magenta">{'◆ ' + row.id}</Text>
                <Text dimColor>  {row.title}</Text>
              </Box>
            );
          }
          if (row.kind === 'intent-meta') {
            return (
              <Box key={`im-${row.requestedBy}-${i}`}>
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
            const statusColor = (STATUS_COLOR[row.status] ?? 'white') as StatusColor;
            return (
              <Box key={`q-${row.id}`} marginLeft={2}>
                <Text dimColor>{row.branch} </Text>
                <Text dimColor>{row.id.slice(0, 16)}  </Text>
                <Text>{row.title.slice(0, 36)}  </Text>
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
              <Box key="orphan-header" marginTop={i > 0 ? 1 : 0}>
                <Text bold color="red">⚠ Orphan quests (sovereignty violation)</Text>
              </Box>
            );
          }
          // orphan
          return (
            <Box key={`o-${row.id}`} marginLeft={2}>
              <Text dimColor>└─ {row.id}  </Text>
              <Text>{row.title.slice(0, 38)}</Text>
            </Box>
          );
        })}
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
