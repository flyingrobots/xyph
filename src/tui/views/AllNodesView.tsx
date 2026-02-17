import React from 'react';
import { Box, Text } from 'ink';
import type { GraphSnapshot } from '../../domain/models/dashboard.js';

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

interface Props {
  snapshot: GraphSnapshot;
}

function StatusText({ status }: { status: string }): React.ReactElement {
  const color = (STATUS_COLOR[status] ?? 'white') as
    | 'green'
    | 'cyan'
    | 'gray'
    | 'red'
    | 'yellow'
    | 'white';
  return <Text color={color}>{status}</Text>;
}

export function AllNodesView({ snapshot }: Props): React.ReactElement {
  const total =
    snapshot.campaigns.length +
    snapshot.quests.length +
    snapshot.intents.length +
    snapshot.scrolls.length +
    snapshot.approvals.length;

  return (
    <Box flexDirection="column">
      <Text bold color="green">
        All WARP Nodes  <Text dimColor>{total} total</Text>
      </Text>

      {snapshot.campaigns.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Campaigns / Milestones</Text>
          {snapshot.campaigns.map((c) => (
            <Box key={c.id} marginLeft={2}>
              <Text dimColor>{c.id.padEnd(22)}</Text>
              <Text>{c.title.slice(0, 38).padEnd(40)}</Text>
              <StatusText status={c.status} />
            </Box>
          ))}
        </Box>
      )}

      {snapshot.intents.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Intents</Text>
          {snapshot.intents.map((intent) => (
            <Box key={intent.id} marginLeft={2}>
              <Text dimColor>{intent.id.padEnd(22)}</Text>
              <Text>{intent.title.slice(0, 36).padEnd(38)}</Text>
              <Text dimColor>{intent.requestedBy}</Text>
            </Box>
          ))}
        </Box>
      )}

      {snapshot.quests.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Quests</Text>
          {snapshot.quests.map((q) => (
            <Box key={q.id} marginLeft={2}>
              <Text dimColor>{q.id.slice(0, 18).padEnd(20)}</Text>
              <Text>{q.title.slice(0, 30).padEnd(32)}</Text>
              <StatusText status={q.status} />
              <Text dimColor>  {q.hours}h</Text>
              {q.scrollId !== undefined && <Text color="green">  ✓</Text>}
            </Box>
          ))}
        </Box>
      )}

      {snapshot.scrolls.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Scrolls</Text>
          {snapshot.scrolls.map((s) => (
            <Box key={s.id} marginLeft={2}>
              <Text dimColor>{s.id.slice(0, 24).padEnd(26)}</Text>
              <Text dimColor>{s.questId.slice(0, 18).padEnd(20)}</Text>
              <Text dimColor>{s.sealedBy.padEnd(16)}</Text>
              <Text color={s.hasSeal ? 'green' : 'yellow'}>
                {s.hasSeal ? '⊕ sealed' : '○ unsigned'}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {snapshot.approvals.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Approval Gates</Text>
          {snapshot.approvals.map((a) => (
            <Box key={a.id} marginLeft={2}>
              <Text dimColor>{a.id.slice(0, 18).padEnd(20)}</Text>
              <StatusText status={a.status} />
              <Text dimColor>  {a.trigger}</Text>
              <Text dimColor>  approver: {a.approver}</Text>
            </Box>
          ))}
        </Box>
      )}

      {total === 0 && (
        <Text dimColor>Graph is empty. Start with: xyph-actuator intent ...</Text>
      )}
    </Box>
  );
}
