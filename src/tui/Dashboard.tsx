import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp, type Key } from 'ink';
import type { DashboardService } from '../domain/services/DashboardService.js';
import type { GraphSnapshot } from '../domain/models/dashboard.js';
import type { IntakePort } from '../ports/IntakePort.js';
import { RoadmapView } from './views/RoadmapView.js';
import { LineageView } from './views/LineageView.js';
import { AllNodesView } from './views/AllNodesView.js';
import { InboxView } from './views/InboxView.js';

type ViewName = 'roadmap' | 'lineage' | 'all' | 'inbox';

const VIEWS: ViewName[] = ['roadmap', 'lineage', 'all', 'inbox'];

interface Props {
  service: DashboardService;
  intake: IntakePort;
  agentId: string;
}

export function Dashboard({ service, intake, agentId }: Props): React.ReactElement {
  const [activeView, setActiveView] = useState<ViewName>('roadmap');
  const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const { exit } = useApp();

  const refresh = (): void => {
    setLoading(true);
    service
      .getSnapshot()
      .then((s) => {
        setSnapshot(s);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useInput((input: string, key: Key) => {
    if (isMutating) return;
    if (input === 'q') {
      exit();
      return;
    }
    if (input === 'r') {
      refresh();
      return;
    }
    if (key.tab) {
      const idx = VIEWS.indexOf(activeView);
      const next = VIEWS[(idx + 1) % VIEWS.length];
      if (next !== undefined) {
        setActiveView(next);
      }
    }
  });

  if (loading) {
    return <Text color="yellow">Loading WARP graph snapshot…</Text>;
  }

  if (error !== null) {
    return <Text color="red">Error: {error}</Text>;
  }

  if (snapshot === null) {
    return <Text color="red">No snapshot available.</Text>;
  }

  // GRAVEYARD is excluded from all active views by default
  const filtered = service.filterSnapshot(snapshot, { includeGraveyard: false });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        {VIEWS.map((v) => (
          <Box key={v} marginRight={2}>
            <Text
              bold={v === activeView}
              color={v === activeView ? 'cyan' : 'gray'}
            >
              {v === activeView ? `[${v}]` : v}
            </Text>
          </Box>
        ))}
        <Text dimColor>
          {'  Tab: cycle  r: refresh  q: quit'}
          {activeView === 'inbox' ? '  (inbox: p promote  x reject)' : ''}
        </Text>
      </Box>
      {activeView === 'roadmap' && <RoadmapView snapshot={filtered} isActive={true} />}
      {activeView === 'lineage' && <LineageView snapshot={filtered} isActive={true} />}
      {activeView === 'all' && <AllNodesView snapshot={filtered} isActive={true} />}
      {activeView === 'inbox' && (
        <InboxView
          snapshot={filtered}
          isActive={true}
          intake={intake}
          agentId={agentId}
          onMutationStart={() => setIsMutating(true)}
          onMutationEnd={() => setIsMutating(false)}
          onRefresh={refresh}
        />
      )}
    </Box>
  );
}
