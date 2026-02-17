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
  PENDING: 'yellow',
  APPROVED: 'green',
  REJECTED: 'red',
};

type StatusColor = 'green' | 'cyan' | 'gray' | 'red' | 'yellow' | 'white';

type VRow =
  | { kind: 'spacer' }
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

function buildRows(snapshot: GraphSnapshot): VRow[] {
  const rows: VRow[] = [];
  let first = true;

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
    pushSection(`Quests  ${snapshot.quests.length}`, snapshot.quests.map(q => ({
      kind: 'quest' as const, id: q.id, title: q.title, status: q.status, hours: q.hours, hasScroll: q.scrollId !== undefined,
    })));
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

  return rows;
}

export function AllNodesView({ snapshot, isActive }: Props): React.ReactElement {
  const { stdout } = useStdout();
  const listHeight = Math.max(4, (stdout.rows ?? 24) - CHROME_LINES);
  const [scrollOffset, setScrollOffset] = useState(0);

  const vrows = buildRows(snapshot);
  const total = snapshot.campaigns.length + snapshot.quests.length +
    snapshot.intents.length + snapshot.scrolls.length + snapshot.approvals.length;

  const maxOffset = Math.max(0, vrows.length - listHeight);
  const clampedOffset = Math.min(scrollOffset, maxOffset);

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
      <Box flexDirection="row">
        <Box flexDirection="column" flexGrow={1}>
        {visibleRows.map((row, i) => {
          if (row.kind === 'spacer') {
            return <Box key={`sp-${i}`}><Text> </Text></Box>;
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
        <Scrollbar total={vrows.length} visible={listHeight} offset={clampedOffset} />
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
