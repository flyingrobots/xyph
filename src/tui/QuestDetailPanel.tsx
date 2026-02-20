import type { ReactElement } from 'react';
import { Box, Text } from 'ink';
import type { QuestNode } from '../domain/models/dashboard.js';
import { STATUS_COLOR } from './status-colors.js';

interface Props {
  quest: QuestNode;
  campaignTitle?: string;
  intentTitle?: string;
}

export function QuestDetailPanel({ quest, campaignTitle, intentTitle }: Props): ReactElement {
  const statusColor = STATUS_COLOR[quest.status] ?? 'white';

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold color="cyan">{quest.id}{'  '}</Text>
        <Text bold>{quest.title}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Status   </Text>
        <Text color={statusColor}>{quest.status}</Text>
        <Text dimColor>   Hours  </Text>
        <Text>{quest.hours}h</Text>
        {quest.assignedTo !== undefined && (
          <>
            <Text dimColor>   Agent  </Text>
            <Text dimColor>{quest.assignedTo}</Text>
          </>
        )}
      </Box>
      {quest.campaignId !== undefined && (
        <Box>
          <Text dimColor>Campaign </Text>
          <Text dimColor>{quest.campaignId}</Text>
          {campaignTitle !== quest.campaignId && campaignTitle !== undefined && (
            <Text dimColor>  {campaignTitle}</Text>
          )}
        </Box>
      )}
      {quest.intentId !== undefined && (
        <Box>
          <Text dimColor>Intent   </Text>
          <Text dimColor>{quest.intentId}</Text>
          {intentTitle !== quest.intentId && intentTitle !== undefined && (
            <Text dimColor>  {intentTitle}</Text>
          )}
        </Box>
      )}
      {quest.scrollId !== undefined && (
        <Box>
          <Text dimColor>Scroll   </Text>
          <Text color="green">{quest.scrollId}{'  ✓'}</Text>
        </Box>
      )}
      {quest.completedAt !== undefined && (
        <Box>
          <Text dimColor>Completed</Text>
          <Text dimColor>{'  '}{new Date(quest.completedAt).toISOString()}</Text>
        </Box>
      )}
      {quest.suggestedBy !== undefined && (
        <Box>
          <Text dimColor>Suggested</Text>
          <Text color="magenta">{'  '}{quest.suggestedBy}</Text>
          {quest.suggestedAt !== undefined && (
            <Text dimColor>  {new Date(quest.suggestedAt).toISOString()}</Text>
          )}
        </Box>
      )}
      {quest.rejectionRationale !== undefined && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow">↩ Previously rejected</Text>
          <Box>
            <Text dimColor>By        </Text>
            <Text dimColor>{quest.rejectedBy ?? '—'}</Text>
            {quest.rejectedAt !== undefined && (
              <Text dimColor>  {new Date(quest.rejectedAt).toISOString()}</Text>
            )}
          </Box>
          <Box>
            <Text dimColor>Rationale </Text>
            <Text dimColor>{quest.rejectionRationale}</Text>
          </Box>
        </Box>
      )}
      {quest.reopenedBy !== undefined && (
        <Box>
          <Text dimColor>Reopened  </Text>
          <Text dimColor>{quest.reopenedBy}</Text>
          {quest.reopenedAt !== undefined && (
            <Text dimColor>  {new Date(quest.reopenedAt).toISOString()}</Text>
          )}
        </Box>
      )}
    </Box>
  );
}
