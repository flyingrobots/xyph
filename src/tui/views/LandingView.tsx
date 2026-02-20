import type { ReactElement } from 'react';
import { Box, Text } from 'ink';
import type { GraphSnapshot } from '../../domain/models/dashboard.js';

interface Props {
  logoText: string;
  snapshot: GraphSnapshot | null;
}

function asciiBar(pct: number, width: number): string {
  const filled = Math.min(width, Math.max(0, Math.round((pct / 100) * width)));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

export function LandingView({ logoText, snapshot }: Props): ReactElement {
  const logoLines = logoText.split('\n');

  let statsContent: ReactElement;

  if (snapshot === null) {
    statsContent = <Text dimColor>Loading WARP graph…</Text>;
  } else {
    const allQuests = snapshot.quests.filter((q) => q.status !== 'INBOX');
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
        <Text bold color="cyan">WARP GRAPH STATUS</Text>
        <Box>
          <Text dimColor>Progress  </Text>
          <Text color="green">[{bar}]</Text>
          <Text>  {String(pct).padStart(3)}%</Text>
          <Text dimColor>  ({doneCount}/{totalCount} quests)</Text>
        </Box>
        {currentMilestone !== undefined && (
          <Box>
            <Text dimColor>Milestone  </Text>
            <Text color="yellow">{currentMilestone}</Text>
          </Box>
        )}
        {first !== undefined && (
          <Box flexDirection="column">
            <Box>
              <Text dimColor>Next up    </Text>
              <Text dimColor>{first.id.slice(0, 14).padEnd(16)}</Text>
              <Text>{first.title.slice(0, 30).padEnd(32)}</Text>
              <Text color="gray">{'[' + first.status + ']'}</Text>
            </Box>
            {nextUp.slice(1).map((item) => (
              <Box key={item.id}>
                <Text dimColor>{'           '}</Text>
                <Text dimColor>{item.id.slice(0, 14).padEnd(16)}</Text>
                <Text>{item.title.slice(0, 30).padEnd(32)}</Text>
                <Text color="gray">{'[' + item.status + ']'}</Text>
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
      {/* Logo */}
      <Box flexDirection="column" alignItems="center">
        {logoLines.map((line, i) => (
          <Box key={i} justifyContent="center">
            <Text color="cyan">{line}</Text>
          </Box>
        ))}
      </Box>

      {/* Stats panel */}
      <Box marginTop={1} flexDirection="column">
        {statsContent}
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>Copyright © 2026 Flying Robots {'<https://github.com/flyingrobots>'}</Text>
      </Box>

      {/* Hint */}
      <Box marginTop={1}>
        <Text dimColor>any key to continue</Text>
        <Text dimColor>  ·  </Text>
        <Text dimColor>q to quit</Text>
      </Box>
    </Box>
  );
}
