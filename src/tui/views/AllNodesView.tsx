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
  PENDING: 'yellow',
  APPROVED: 'green',
  REJECTED: 'red',
};

type StatusColor = 'green' | 'cyan' | 'gray' | 'red' | 'yellow' | 'white';

type VRow =
  | { kind: 'header'; label: string }
  | { kind: 'campaign'; id: string; title: string; status: string }
  | { kind: 'intent'; id: string; title: string; requestedBy: string }
  | { kind: 'quest'; id: string; title: string; status: string; hours: number; hasScroll: boolean }
  | { kind: 'scroll'; id: string; questId: string; sealedBy: string; hasSeal: boolean }
  | { kind: 'approval'; id: string; status: string; trigger: string; approver: string };

interface Props {
  snapshot: GraphSnapshot;
  isActive: boolean;
}

function StatusText({ status }: { status: string }): React.ReactElement {
  const color = (STATUS_COLOR[status] ?? 'white') as StatusColor;
  return <Text color={color}>{status}</Text>;
}

export function AllNodesView({ snapshot, isActive }: Props): React.ReactElement {
  const { stdout } = useStdout();
  const listHeight = Math.max(4, (stdout.rows ?? 24) - CHROME_LINES);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Build flat virtual row list
  const vrows: VRow[] = [];

  if (snapshot.campaigns.length > 0) {
    vrows.push({ kind: 'header', label: `Campaigns / Milestones  ${snapshot.campaigns.length}` });
    for (const c of snapshot.campaigns) {
      vrows.push({ kind: 'campaign', id: c.id, title: c.title, status: c.status });
    }
  }

  if (snapshot.intents.length > 0) {
    vrows.push({ kind: 'header', label: `Intents  ${snapshot.intents.length}` });
    for (const intent of snapshot.intents) {
      vrows.push({ kind: 'intent', id: intent.id, title: intent.title, requestedBy: intent.requestedBy });
    }
  }

  if (snapshot.quests.length > 0) {
    vrows.push({ kind: 'header', label: `Quests  ${snapshot.quests.length}` });
    for (const q of snapshot.quests) {
      vrows.push({ kind: 'quest', id: q.id, title: q.title, status: q.status, hours: q.hours, hasScroll: q.scrollId !== undefined });
    }
  }

  if (snapshot.scrolls.length > 0) {
    vrows.push({ kind: 'header', label: `Scrolls  ${snapshot.scrolls.length}` });
    for (const s of snapshot.scrolls) {
      vrows.push({ kind: 'scroll', id: s.id, questId: s.questId, sealedBy: s.sealedBy, hasSeal: s.hasSeal });
    }
  }

  if (snapshot.approvals.length > 0) {
    vrows.push({ kind: 'header', label: `Approval Gates  ${snapshot.approvals.length}` });
    for (const a of snapshot.approvals) {
      vrows.push({ kind: 'approval', id: a.id, status: a.status, trigger: a.trigger, approver: a.approver });
    }
  }

  const total = snapshot.campaigns.length + snapshot.quests.length +
    snapshot.intents.length + snapshot.scrolls.length + snapshot.approvals.length;

  const clampedOffset = Math.min(scrollOffset, Math.max(0, vrows.length - listHeight));

  useEffect(() => {
    setScrollOffset(prev => Math.min(prev, Math.max(0, vrows.length - listHeight)));
  }, [vrows.length, listHeight]);

  useInput((_input: string, key: Key) => {
    if (key.upArrow) setScrollOffset(prev => Math.max(0, prev - 1));
    if (key.downArrow) setScrollOffset(prev => Math.min(Math.max(0, vrows.length - listHeight), prev + 1));
  }, { isActive });

  if (total === 0) {
    return <Text dimColor>Graph is empty. Start with: xyph-actuator intent ...</Text>;
  }

  const visibleRows = vrows.slice(clampedOffset, clampedOffset + listHeight);

  return (
    <Box flexDirection="column">
      <Box flexDirection="column">
        {visibleRows.map((row, i) => {
          if (row.kind === 'header') {
            return (
              <Box key={`h-${row.label}`} marginTop={i > 0 ? 1 : 0}>
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
            return (
              <Box key={row.id} marginLeft={2}>
                <Text dimColor>{row.id.slice(0, 18).padEnd(20)}</Text>
                <Text>{row.title.slice(0, 30).padEnd(32)}</Text>
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
      <Text dimColor>
        {'  '}{total} nodes
        {vrows.length > listHeight
          ? `  rows ${clampedOffset + 1}–${Math.min(clampedOffset + listHeight, vrows.length)}/${vrows.length}  ↑↓`
          : '  ↑↓'}
      </Text>
    </Box>
  );
}
