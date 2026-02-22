import type { ReactElement } from 'react';
import { useState, useMemo } from 'react';
import { Box, Text, useInput, useStdout, type Key } from 'ink';
import type { GraphSnapshot } from '../../domain/models/dashboard.js';
import { useTheme } from '../theme/index.js';
import { Scrollbar } from '../Scrollbar.js';

const DEFAULT_CHROME_LINES = 4;
const SCROLL_MARGIN = 2;

const trunc = (s: string, n: number): string => s.length > n ? s.slice(0, n - 1) + '…' : s;

type VRow =
  | { kind: 'spacer' }
  | { kind: 'intent-header'; id: string; title: string }
  | { kind: 'intent-meta'; requestedBy: string }
  | { kind: 'quest'; id: string; title: string; status: string; branch: string; scrollId: string | undefined; sealed: boolean }
  | { kind: 'scroll-sub'; scrollId: string }
  | { kind: 'no-quests'; branch: string }
  | { kind: 'orphan-header' }
  | { kind: 'orphan'; id: string; title: string };

interface Props {
  snapshot: GraphSnapshot;
  isActive: boolean;
  chromeLines?: number;
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
      rows.push({ kind: 'no-quests', branch: '└─' });
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

export function LineageView({ snapshot, isActive, chromeLines }: Props): ReactElement {
  const t = useTheme();
  const { stdout } = useStdout();
  const chrome = chromeLines ?? DEFAULT_CHROME_LINES;
  const listHeight = Math.max(4, (stdout.rows ?? 24) - chrome);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [selectedVIdx, setSelectedVIdx] = useState(0);

  const vrows = useMemo(() => buildRows(snapshot), [snapshot]);
  const maxOffset = Math.max(0, vrows.length - listHeight);
  const clampedOffset = Math.min(scrollOffset, maxOffset);

  // Navigable quest row indices (only real quests, not no-quests placeholders)
  const questIndices = vrows
    .map((r, i) => (r.kind === 'quest' ? i : -1))
    .filter((i) => i >= 0);

  const clampedVIdx = ((): number => {
    if (questIndices.length === 0) return 0;
    if (questIndices.includes(selectedVIdx)) return selectedVIdx;
    // Find closest navigable index (nearest-neighbor fallback)
    let closest = questIndices[0] ?? 0;
    for (const qi of questIndices) {
      if (Math.abs(qi - selectedVIdx) < Math.abs(closest - selectedVIdx)) closest = qi;
    }
    return closest;
  })();

  function moveSelection(delta: number): void {
    if (questIndices.length === 0) return;
    const curPos = questIndices.indexOf(clampedVIdx);
    const nextPos = Math.max(0, Math.min(questIndices.length - 1, curPos + delta));
    const nextVIdx = questIndices[nextPos] ?? 0;

    if (nextVIdx < clampedOffset + SCROLL_MARGIN) {
      setScrollOffset(Math.max(0, nextVIdx - SCROLL_MARGIN));
    } else if (nextVIdx >= clampedOffset + listHeight - SCROLL_MARGIN) {
      setScrollOffset(Math.min(maxOffset, nextVIdx - listHeight + 1 + SCROLL_MARGIN));
    }
    setSelectedVIdx(nextVIdx);
  }

  useInput((_input: string, key: Key) => {
    if (key.upArrow) { moveSelection(-1); return; }
    if (key.downArrow) { moveSelection(1); return; }
    if (key.pageUp) { moveSelection(-listHeight); return; }
    if (key.pageDown) { moveSelection(listHeight); return; }
  }, { isActive });

  if (snapshot.intents.length === 0) {
    return (
      <Box flexDirection="column">
        <Text bold color={t.ink(t.theme.ui.intentHeader)}>Genealogy of Intent</Text>
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
            return <Box key={`sp-${clampedOffset + i}`}><Text> </Text></Box>;
          }
          if (row.kind === 'intent-header') {
            return (
              <Box key={`ih-${row.id}`}>
                <Text bold color={t.ink(t.theme.ui.intentHeader)}>{'◆ ' + trunc(row.id, 30)}</Text>
                <Text dimColor>  {trunc(row.title, 38)}</Text>
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
          if (row.kind === 'no-quests') {
            return (
              <Box key={`nq-${i}`} marginLeft={2}>
                <Text dimColor>{row.branch} (no quests)</Text>
              </Box>
            );
          }
          if (row.kind === 'quest') {
            const isSelected = absIdx === clampedVIdx;
            return (
              <Box key={`q-${row.id}`} marginLeft={2}>
                <Box width={2}>
                  <Text color={t.ink(t.theme.ui.cursor)}>{isSelected ? '▶' : ' '}</Text>
                </Box>
                <Text dimColor>{row.branch} </Text>
                <Text dimColor>{trunc(row.id, 16)}  </Text>
                <Text bold={isSelected}>{trunc(row.title, 36)}  </Text>
                <Text color={t.inkStatus(row.status)}>{'[' + row.status + ']'}</Text>
                {row.scrollId !== undefined && (
                  <Text color={row.sealed ? t.ink(t.theme.semantic.success) : t.ink(t.theme.semantic.warning)}>
                    {row.sealed ? '  ✓' : '  ○'}
                  </Text>
                )}
              </Box>
            );
          }
          if (row.kind === 'scroll-sub') {
            return (
              <Box key={`s-${row.scrollId}`} marginLeft={5}>
                <Text dimColor>scroll: {trunc(row.scrollId, 50)}</Text>
              </Box>
            );
          }
          if (row.kind === 'orphan-header') {
            return (
              <Box key="orphan-header">
                <Text bold color={t.ink(t.theme.semantic.error)}>⚠ Orphan quests (sovereignty violation)</Text>
              </Box>
            );
          }
          return (
            <Box key={`o-${row.id}`} marginLeft={2}>
              <Text dimColor>└─ {trunc(row.id, 24)}  </Text>
              <Text>{trunc(row.title, 38)}</Text>
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
