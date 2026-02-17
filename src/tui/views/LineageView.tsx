import React from 'react';
import { Box, Text } from 'ink';
import type { GraphSnapshot } from '../../domain/models/dashboard.js';

const STATUS_COLOR: Record<string, string> = {
  DONE: 'green',
  IN_PROGRESS: 'cyan',
  BACKLOG: 'gray',
  BLOCKED: 'red',
  PLANNED: 'yellow',
};

interface Props {
  snapshot: GraphSnapshot;
}

export function LineageView({ snapshot }: Props): React.ReactElement {
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

  if (snapshot.intents.length === 0) {
    return (
      <Box flexDirection="column">
        <Text bold color="magenta">
          Genealogy of Intent
        </Text>
        <Text dimColor>
          No intents declared yet. Use: xyph-actuator intent {'<id>'} --title {'"..."'} --requested-by human.{'<name>'}
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold color="magenta">
        Genealogy of Intent
      </Text>
      {snapshot.intents.map((intent) => {
        const quests = questsByIntent.get(intent.id) ?? [];
        return (
          <Box key={intent.id} flexDirection="column" marginTop={1}>
            <Box>
              <Text bold color="magenta">
                {'◆ ' + intent.id}
              </Text>
              <Text dimColor>  {intent.title}</Text>
            </Box>
            <Text dimColor>  requested-by: {intent.requestedBy}</Text>
            {quests.length === 0 ? (
              <Text dimColor>  └─ (no quests)</Text>
            ) : (
              quests.map((q, i) => {
                const isLast = i === quests.length - 1;
                const branch = isLast ? '└─' : '├─';
                const scrollId = scrollByQuestId.get(q.id);
                const sealed = scrollHasSeal.get(q.id) ?? false;
                const statusColor = (STATUS_COLOR[q.status] ?? 'white') as 'green' | 'cyan' | 'gray' | 'red' | 'yellow' | 'white';
                return (
                  <Box key={q.id} flexDirection="column">
                    <Box marginLeft={2}>
                      <Text dimColor>{branch} </Text>
                      <Text dimColor>{q.id.slice(0, 16)}  </Text>
                      <Text>{q.title.slice(0, 36)}  </Text>
                      <Text color={statusColor}>{'[' + q.status + ']'}</Text>
                      {scrollId !== undefined && (
                        <Text color={sealed ? 'green' : 'yellow'}>
                          {sealed ? '  ✓' : '  ○'}
                        </Text>
                      )}
                    </Box>
                    {scrollId !== undefined && (
                      <Box marginLeft={5}>
                        <Text dimColor>scroll: {scrollId}</Text>
                      </Box>
                    )}
                  </Box>
                );
              })
            )}
          </Box>
        );
      })}
      {orphans.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="red">
            ⚠ Orphan quests (sovereignty violation)
          </Text>
          {orphans.map((q) => (
            <Box key={q.id} marginLeft={2}>
              <Text dimColor>└─ {q.id}  </Text>
              <Text>{q.title.slice(0, 38)}</Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
