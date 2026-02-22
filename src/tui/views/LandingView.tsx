import type { ReactElement } from 'react';
import { Box, Text } from 'ink';
import type { GraphSnapshot } from '../../domain/models/dashboard.js';
import { useTheme } from '../theme/index.js';

interface Props {
  logoText: string;
  snapshot: GraphSnapshot | null;
  loadLog?: string[];
}

function asciiBar(pct: number, width: number): string {
  const filled = Math.min(width, Math.max(0, Math.round((pct / 100) * width)));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

export function LandingView({ logoText, snapshot, loadLog }: Props): ReactElement {
  const t = useTheme();
  const logoLines = logoText.split('\n');

  let statsContent: ReactElement;

  if (snapshot === null) {
    const lines = loadLog ?? [];
    statsContent = (
      <Box flexDirection="column">
        <Text dimColor>{'─'.repeat(41)}</Text>
        <Text bold color={t.ink(t.theme.semantic.warning)}>Loading Project Graph…</Text>
        {lines.map((line, i) => (
          <Text key={i} dimColor>  {line}</Text>
        ))}
        <Text dimColor>{'─'.repeat(41)}</Text>
      </Box>
    );
  } else {
    const allQuests = snapshot.quests.filter(
      (q) => q.status !== 'INBOX' && q.status !== 'GRAVEYARD',
    );
    const doneCount = allQuests.filter((q) => q.status === 'DONE').length;
    const totalCount = allQuests.length;
    const pct = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);
    const bar = asciiBar(pct, 20);

    // Current milestone: first campaign where most quests are not DONE
    const questsByCampaign = new Map<string, typeof snapshot.quests>();
    for (const q of snapshot.quests) {
      if (q.campaignId !== undefined && q.status !== 'INBOX' && q.status !== 'GRAVEYARD') {
        const arr = questsByCampaign.get(q.campaignId) ?? [];
        arr.push(q);
        questsByCampaign.set(q.campaignId, arr);
      }
    }

    let currentMilestone: string | undefined;
    for (const c of snapshot.campaigns) {
      const qs = questsByCampaign.get(c.id) ?? [];
      const notDone = qs.filter((q) => q.status !== 'DONE').length;
      if (notDone > 0) {
        currentMilestone = `${c.id}  ${c.title}`;
        break;
      }
    }

    // Next 3 quests with BACKLOG or PLANNED status
    const nextUp = snapshot.quests
      .filter((q) => q.status === 'BACKLOG' || q.status === 'PLANNED')
      .slice(0, 3);

    const first = nextUp[0];

    statsContent = (
      <Box flexDirection="column">
        <Text dimColor>{'─'.repeat(41)}</Text>
        <Text bold color={t.ink(t.theme.ui.cursor)}>XYPH GRAPH STATUS</Text>
        <Box>
          <Text dimColor>Progress  </Text>
          <Text color={t.ink(t.theme.semantic.success)}>[{bar}]</Text>
          <Text>  {String(pct).padStart(3)}%</Text>
          <Text dimColor>  ({doneCount}/{totalCount} quests)</Text>
        </Box>
        {currentMilestone !== undefined && (
          <Box>
            <Text dimColor>Milestone  </Text>
            <Text color={t.ink(t.theme.semantic.warning)}>{currentMilestone}</Text>
          </Box>
        )}
        {first !== undefined && (
          <Box flexDirection="column">
            <Box>
              <Text dimColor>Next up    </Text>
              <Text dimColor>{first.id.slice(0, 14).padEnd(16)}</Text>
              <Text>{first.title.slice(0, 30).padEnd(32)}</Text>
              <Text color={t.ink(t.theme.semantic.muted)}>{'[' + first.status + ']'}</Text>
            </Box>
            {nextUp.slice(1).map((item) => (
              <Box key={item.id}>
                <Text dimColor>{'           '}</Text>
                <Text dimColor>{item.id.slice(0, 14).padEnd(16)}</Text>
                <Text>{item.title.slice(0, 30).padEnd(32)}</Text>
                <Text color={t.ink(t.theme.semantic.muted)}>{'[' + item.status + ']'}</Text>
              </Box>
            ))}
          </Box>
        )}
        <Text dimColor>{'─'.repeat(41)}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" alignItems="center">
      {/* Logo — center as a single block to preserve internal alignment */}
      <Box justifyContent="center">
        <Box flexDirection="column">
          {logoLines.map((line, i) => (
            <Text key={i} color={t.ink(t.theme.ui.logo)}>{line}</Text>
          ))}
        </Box>
      </Box>

      {/* Stats panel */}
      <Box marginTop={1} flexDirection="column">
        {statsContent}
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>Copyright © 2026 Flying Robots {'<https://github.com/flyingrobots>'}</Text>
      </Box>

      {/* Hint — the actual key handler lives in Dashboard.tsx (N-21: display here, logic in parent) */}
      <Box marginTop={1}>
        <Text dimColor>any key to continue</Text>
        <Text dimColor>  ·  </Text>
        <Text dimColor>q to quit</Text>
      </Box>
    </Box>
  );
}
