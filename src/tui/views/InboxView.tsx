import type { ReactElement } from 'react';
import { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput, useStdout, type Key } from 'ink';
import type { GraphSnapshot, QuestNode } from '../../domain/models/dashboard.js';
import type { IntakePort } from '../../ports/IntakePort.js';
import { useTheme } from '../theme/index.js';
import { Scrollbar } from '../Scrollbar.js';

const DEFAULT_CHROME_LINES = 4;
const SCROLL_MARGIN = 2;

type ModalState =
  | null
  | { kind: 'select-intent'; intentIdx: number; questId: string }
  | { kind: 'rationale'; buffer: string; questId: string }
  | { kind: 'mutating'; action: string }
  | { kind: 'error'; code: string | null; message: string };

type VRow =
  | { kind: 'spacer' }
  | { kind: 'header'; label: string }
  | { kind: 'quest'; quest: QuestNode; flatIdx: number };

interface Props {
  snapshot: GraphSnapshot;
  isActive: boolean;
  intake: IntakePort;
  agentId: string;
  onMutationStart: () => void;
  onMutationEnd: () => void;
  onRefresh: () => void;
  chromeLines?: number;
}

function parseErrorMessage(err: unknown): { code: string | null; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const match = /^\[(\w+)\]\s*(.+)/.exec(raw);
  if (match !== null) {
    return { code: match[1] ?? null, message: match[2] ?? raw };
  }
  return { code: null, message: raw };
}

export function InboxView({
  snapshot,
  isActive,
  intake,
  agentId,
  onMutationStart,
  onMutationEnd,
  onRefresh,
  chromeLines,
}: Props): ReactElement {
  const t = useTheme();
  const { stdout } = useStdout();
  const chrome = chromeLines ?? DEFAULT_CHROME_LINES;
  const cols = stdout.columns ?? 80;

  // Proportional split: 40% list, 60% detail
  const availableRows = (stdout.rows ?? 24) - chrome;

  // Column widths: title absorbs remaining terminal width
  const cursorW = 2;
  const idW = 18;
  const suggestedByW = 16;
  const dateW = 10;
  const historyW = 3; // "  ↩"
  const scrollbarW = 2;
  const inboxTitleW = Math.max(12, cols - cursorW - idW - suggestedByW - dateW - historyW - scrollbarW);
  const listHeight = Math.max(3, Math.floor(availableRows * 0.40));
  const detailHeight = Math.max(0, availableRows - listHeight);

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [modal, setModal] = useState<ModalState>(null);

  const intents = snapshot.intents;

  const { vrows, flatQuests } = useMemo(() => {
    const inbox = snapshot.quests.filter((q) => q.status === 'INBOX');
    const suggesterOrder: string[] = [];
    const grouped = new Map<string, QuestNode[]>();
    for (const q of inbox) {
      const key = q.suggestedBy ?? '(unknown suggester)';
      if (!grouped.has(key)) {
        suggesterOrder.push(key);
        grouped.set(key, []);
      }
      grouped.get(key)?.push(q);
    }
    const rows: VRow[] = [];
    const quests: QuestNode[] = [];
    for (const key of suggesterOrder) {
      if (rows.length > 0) rows.push({ kind: 'spacer' });
      rows.push({ kind: 'header', label: key });
      for (const q of grouped.get(key) ?? []) {
        rows.push({ kind: 'quest', quest: q, flatIdx: quests.length });
        quests.push(q);
      }
    }
    return { vrows: rows, flatQuests: quests };
  }, [snapshot]);

  const totalQuests = flatQuests.length;

  useEffect(() => {
    setSelectedIdx((prev) =>
      totalQuests === 0 ? 0 : Math.min(prev, totalQuests - 1)
    );
  }, [totalQuests]);

  // Dismiss stale modal if the referenced quest was removed from inbox (M-34)
  useEffect(() => {
    if (modal === null || modal.kind === 'mutating' || modal.kind === 'error') return;
    const questId = modal.questId;
    const stillExists = flatQuests.some((q) => q.id === questId);
    if (!stillExists) {
      setModal(null);
    }
  }, [flatQuests, modal]);

  const clampedIdx = totalQuests === 0 ? 0 : Math.min(selectedIdx, totalQuests - 1);
  const maxOffset = Math.max(0, vrows.length - listHeight);
  const clampedOffset = Math.min(scrollOffset, maxOffset);

  function moveSelection(delta: number): void {
    if (totalQuests === 0) return;
    const next = Math.max(0, Math.min(totalQuests - 1, clampedIdx + delta));
    const vIdx = vrows.findIndex((r) => r.kind === 'quest' && r.flatIdx === next);
    if (vIdx >= 0) {
      if (vIdx < clampedOffset + SCROLL_MARGIN) {
        setScrollOffset(Math.max(0, vIdx - SCROLL_MARGIN));
      } else if (vIdx >= clampedOffset + listHeight - SCROLL_MARGIN) {
        setScrollOffset(Math.min(maxOffset, vIdx - listHeight + 1 + SCROLL_MARGIN));
      }
    }
    setSelectedIdx(next);
  }

  function runPromote(questId: string, intentId: string): void {
    const action = `promote for ${questId}`;
    setModal({ kind: 'mutating', action });
    onMutationStart();
    intake.promote(questId, intentId)
      .then(() => {
        onRefresh();
        onMutationEnd();
        setModal(null);
      })
      .catch((err: unknown) => {
        onMutationEnd();
        const parsed = parseErrorMessage(err);
        setModal({ kind: 'error', code: parsed.code, message: parsed.message });
      });
  }

  function runReject(questId: string, rationale: string): void {
    const action = `reject for ${questId}`;
    setModal({ kind: 'mutating', action });
    onMutationStart();
    intake.reject(questId, rationale)
      .then(() => {
        onRefresh();
        onMutationEnd();
        setModal(null);
      })
      .catch((err: unknown) => {
        onMutationEnd();
        const parsed = parseErrorMessage(err);
        setModal({ kind: 'error', code: parsed.code, message: parsed.message });
      });
  }

  useInput((input: string, key: Key) => {
    // Error modal: any key closes it
    if (modal?.kind === 'error') {
      setModal(null);
      return;
    }

    // Mutating: ignore all keypresses (idempotency gate)
    if (modal?.kind === 'mutating') {
      return;
    }

    // Select-intent modal
    if (modal?.kind === 'select-intent') {
      if (key.upArrow) {
        setModal({ ...modal, intentIdx: Math.max(0, modal.intentIdx - 1) });
        return;
      }
      if (key.downArrow) {
        if (intents.length === 0) return;
        setModal({ ...modal, intentIdx: Math.min(intents.length - 1, modal.intentIdx + 1) });
        return;
      }
      if (key.return) {
        const selectedIntent = intents[modal.intentIdx];
        if (selectedIntent !== undefined) {
          runPromote(modal.questId, selectedIntent.id);
        }
        return;
      }
      if (key.escape) {
        setModal(null);
        return;
      }
      return;
    }

    // Rationale modal
    if (modal?.kind === 'rationale') {
      if (key.escape) {
        setModal(null);
        return;
      }
      if (key.return) {
        if (modal.buffer.trim().length > 0) {
          runReject(modal.questId, modal.buffer.trim());
        }
        return;
      }
      if (key.backspace || key.delete) {
        setModal({ ...modal, buffer: modal.buffer.slice(0, -1) });
        return;
      }
      // Guard arrow keys and tab before printable char handler
      if (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow || key.tab) {
        return;
      }
      // Printable chars
      if (input.length > 0 && !key.ctrl && !key.meta) {
        setModal({ ...modal, buffer: modal.buffer + input });
        return;
      }
      return;
    }

    // Normal navigation (modal === null)
    // Tab is handled by Dashboard for view switching — ignore here
    if (key.tab) return;
    if (key.upArrow) {
      moveSelection(-1);
      return;
    }
    if (key.downArrow) {
      moveSelection(1);
      return;
    }
    if (key.pageUp) {
      moveSelection(-listHeight);
      return;
    }
    if (key.pageDown) {
      moveSelection(listHeight);
      return;
    }

    if (input === 'p') {
      if (totalQuests === 0) return;
      if (!agentId.startsWith('human.')) {
        setModal({ kind: 'error', code: 'FORBIDDEN', message: `requires human.* agent ID, got: '${agentId.slice(0, 40)}'` });
        return;
      }
      if (intents.length === 0) {
        setModal({ kind: 'error', code: null, message: 'No intents available — create one first with xyph-actuator intent' });
        return;
      }
      const quest = flatQuests[clampedIdx];
      if (quest === undefined) return;
      setModal({ kind: 'select-intent', intentIdx: 0, questId: quest.id });
      return;
    }

    if (input === 'x') {
      if (totalQuests === 0) return;
      const quest = flatQuests[clampedIdx];
      if (quest === undefined) return;
      setModal({ kind: 'rationale', buffer: '', questId: quest.id });
      return;
    }
  }, { isActive });

  const selectedQuest: QuestNode | null = flatQuests[clampedIdx] ?? null;

  // Render modals (full-view overlays)
  if (modal?.kind === 'select-intent') {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={t.ink(t.theme.border.primary)} paddingX={1}>
        <Text bold color={t.ink(t.theme.ui.cursor)}>
          Promote: {modal.questId} to BACKLOG
        </Text>
        <Text>Select Sovereign Intent (↑↓ Enter)</Text>
        <Box flexDirection="column" marginTop={1}>
          {intents.map((intent, i) => (
            <Box key={intent.id}>
              <Text color={i === modal.intentIdx ? t.ink(t.theme.ui.cursor) : undefined}>
                {i === modal.intentIdx ? '▶ ' : '  '}
              </Text>
              <Text bold={i === modal.intentIdx} color={i === modal.intentIdx ? undefined : t.ink(t.theme.semantic.muted)}>
                {intent.id.slice(0, 24).padEnd(26)}
              </Text>
              <Text dimColor={i !== modal.intentIdx}>{intent.title.slice(0, 40)}</Text>
            </Box>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Esc to cancel</Text>
        </Box>
      </Box>
    );
  }

  if (modal?.kind === 'rationale') {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={t.ink(t.theme.border.warning)} paddingX={1}>
        <Text bold color={t.ink(t.theme.semantic.warning)}>Reject: {modal.questId}</Text>
        <Text>Rejection rationale:</Text>
        <Box marginTop={1}>
          <Text>{`> ${modal.buffer}_`}</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Enter to confirm · Esc to cancel</Text>
        </Box>
      </Box>
    );
  }

  if (modal?.kind === 'mutating') {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={t.ink(t.theme.border.primary)} paddingX={1}>
        <Text color={t.ink(t.theme.ui.cursor)}>Applying {modal.action}…</Text>
      </Box>
    );
  }

  if (modal?.kind === 'error') {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor={t.ink(t.theme.border.error)} paddingX={1}>
        <Box>
          {modal.code !== null
            ? <><Text color={t.ink(t.theme.semantic.error)}>[{modal.code}]</Text><Text> {modal.message}</Text></>
            : <Text color={t.ink(t.theme.semantic.error)}>{modal.message}</Text>
          }
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Any key to dismiss</Text>
        </Box>
      </Box>
    );
  }

  if (totalQuests === 0) {
    return (
      <Box flexDirection="column">
        <Text bold color={t.ink(t.theme.ui.intentHeader)}>INBOX</Text>
        <Text dimColor>No tasks awaiting triage.</Text>
        <Text dimColor>Add one: xyph-actuator inbox task:ID --title {'<text>'} --suggested-by {'<principal>'}</Text>
        <Box borderStyle="round" borderColor={t.ink(t.theme.border.muted)} marginTop={1} paddingX={1}>
          <Text dimColor>(no task selected)</Text>
        </Box>
      </Box>
    );
  }

  const visibleRows = vrows.slice(clampedOffset, clampedOffset + listHeight);

  return (
    <Box flexDirection="column">
      {/* List pane */}
      <Box flexDirection="row">
        <Box flexDirection="column" flexGrow={1}>
          {visibleRows.map((row, i) => {
            if (row.kind === 'spacer') {
              return <Box key={`sp-${clampedOffset + i}`}><Text> </Text></Box>;
            }
            if (row.kind === 'header') {
              return (
                <Box key={`h-${row.label}`}>
                  <Text bold color={t.ink(t.theme.ui.intentHeader)}>{row.label}</Text>
                </Box>
              );
            }
            const q = row.quest;
            const isSelected = row.flatIdx === clampedIdx;
            const hasHistory = q.rejectionRationale !== undefined;
            const dateStr = q.suggestedAt !== undefined
              ? new Date(q.suggestedAt).toISOString().slice(0, 10)
              : '          ';
            return (
              <Box key={q.id}>
                <Box width={2}>
                  <Text color={t.ink(t.theme.ui.cursor)}>{isSelected ? '▶' : ' '}</Text>
                </Box>
                <Text bold={isSelected} color={isSelected ? undefined : t.ink(t.theme.semantic.muted)}>
                  {q.id.slice(0, idW - 2).padEnd(idW)}
                </Text>
                <Text bold={isSelected}>{q.title.slice(0, inboxTitleW - 2).padEnd(inboxTitleW)}</Text>
                <Text dimColor>{(q.suggestedBy ?? '').slice(0, suggestedByW - 2).padEnd(suggestedByW)}</Text>
                <Text dimColor>{dateStr}</Text>
                {hasHistory && <Text color={t.ink(t.theme.semantic.warning)}>  ↩</Text>}
              </Box>
            );
          })}
        </Box>
        <Scrollbar total={vrows.length} visible={listHeight} offset={clampedOffset} />
      </Box>

      {/* Scroll indicator */}
      <Text dimColor>
        {'  quest '}
        {clampedIdx + 1}/{totalQuests}
        {vrows.length > listHeight
          ? `  rows ${clampedOffset + 1}–${Math.min(clampedOffset + listHeight, vrows.length)}/${vrows.length}  ↑↓`
          : '  ↑↓'}
        {'  p: promote (human.* only)  x: reject'}
      </Text>

      {/* Detail pane — always visible, proportional height */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={t.ink(t.theme.border.secondary)}
        paddingX={1}
        height={detailHeight}
      >
        {selectedQuest !== null ? (
          <>
            <Box>
              <Text bold color={t.ink(t.theme.ui.intentHeader)}>{selectedQuest.id}{'  '}</Text>
              <Text bold>{selectedQuest.title}</Text>
            </Box>
            <Box marginTop={1}>
              <Text dimColor>Hours     </Text>
              <Text>{selectedQuest.hours}h</Text>
            </Box>
            {selectedQuest.suggestedBy !== undefined && (
              <Box>
                <Text dimColor>Suggested </Text>
                <Text color={t.ink(t.theme.semantic.accent)}>{selectedQuest.suggestedBy}</Text>
                {selectedQuest.suggestedAt !== undefined && (
                  <Text dimColor>  {new Date(selectedQuest.suggestedAt).toISOString()}</Text>
                )}
              </Box>
            )}
            {selectedQuest.rejectionRationale !== undefined && (
              <Box flexDirection="column" marginTop={1}>
                <Text color={t.ink(t.theme.semantic.warning)}>↩ Previously rejected</Text>
                <Box>
                  <Text dimColor>By        </Text>
                  <Text dimColor>{selectedQuest.rejectedBy ?? '—'}</Text>
                  {selectedQuest.rejectedAt !== undefined && (
                    <Text dimColor>  {new Date(selectedQuest.rejectedAt).toISOString()}</Text>
                  )}
                </Box>
                <Box>
                  <Text dimColor>Rationale </Text>
                  <Text dimColor>{selectedQuest.rejectionRationale}</Text>
                </Box>
              </Box>
            )}
            {selectedQuest.reopenedBy !== undefined && (
              <Box>
                <Text dimColor>Reopened  </Text>
                <Text dimColor>{selectedQuest.reopenedBy}</Text>
                {selectedQuest.reopenedAt !== undefined && (
                  <Text dimColor>  {new Date(selectedQuest.reopenedAt).toISOString()}</Text>
                )}
              </Box>
            )}
          </>
        ) : (
          <Text dimColor>(no task selected)</Text>
        )}
      </Box>
    </Box>
  );
}
