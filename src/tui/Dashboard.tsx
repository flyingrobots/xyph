import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { ReactElement } from 'react';
import { Box, Text, useInput, useApp, type Key } from 'ink';
import type { DashboardService } from '../domain/services/DashboardService.js';
import type { GraphSnapshot } from '../domain/models/dashboard.js';
import type { IntakePort } from '../ports/IntakePort.js';
import { RoadmapView } from './views/RoadmapView.js';
import { LineageView } from './views/LineageView.js';
import { AllNodesView } from './views/AllNodesView.js';
import { InboxView } from './views/InboxView.js';
import { LandingView } from './views/LandingView.js';
import { HelpModal } from './HelpModal.js';

type ViewName = 'roadmap' | 'lineage' | 'all' | 'inbox';

const VIEWS: ViewName[] = ['roadmap', 'lineage', 'all', 'inbox'];

interface Props {
  service: DashboardService;
  intake: IntakePort;
  agentId: string;
  logoText: string;
}

export function Dashboard({ service, intake, agentId, logoText }: Props): ReactElement {
  const [activeView, setActiveView] = useState<ViewName>('roadmap');
  const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [showLanding, setShowLanding] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const { exit } = useApp();

  const requestCounter = useRef(0);

  const refresh = useCallback((): void => {
    setLoading(true);
    const thisRequest = ++requestCounter.current;
    service
      .getSnapshot()
      .then((s) => {
        if (requestCounter.current !== thisRequest) return; // stale response
        setSnapshot(s);
        setError(null);
      })
      .catch((err: unknown) => {
        if (requestCounter.current !== thisRequest) return; // stale response
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (requestCounter.current !== thisRequest) return; // stale response
        setLoading(false);
      });
  }, [service]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useInput((input: string, key: Key) => {
    if (showLanding) {
      if (input === 'q') {
        exit();
      } else {
        setShowLanding(false);
      }
      return;
    }

    if (showHelp) {
      if (key.escape || input === '?') {
        setShowHelp(false);
      }
      return;
    }

    if (isMutating) return;

    if (input === 'q') {
      exit();
      return;
    }
    if (input === 'r') {
      refresh();
      return;
    }
    if (input === '?') {
      setShowHelp(true);
      return;
    }
    if (key.tab) {
      const idx = VIEWS.indexOf(activeView);
      if (key.shift) {
        const prev = VIEWS[(idx - 1 + VIEWS.length) % VIEWS.length];
        if (prev !== undefined) setActiveView(prev);
      } else {
        const next = VIEWS[(idx + 1) % VIEWS.length];
        if (next !== undefined) setActiveView(next);
      }
    }
  });

  // GRAVEYARD is excluded from all active views by default
  // NOTE: useMemo must be called before any conditional returns (Rules of Hooks)
  const filtered = useMemo(
    () => snapshot ? service.filterSnapshot(snapshot, { includeGraveyard: false }) : null,
    [service, snapshot],
  );

  // Landing screen — shown until user presses any key
  if (showLanding) {
    // Pass snapshot even if still loading (LandingView handles null)
    return <LandingView logoText={logoText} snapshot={snapshot} />;
  }

  if (loading) {
    return <Text color="yellow">Loading WARP graph snapshot…</Text>;
  }

  if (error !== null) {
    return <Text color="red">Error: {error}</Text>;
  }

  if (snapshot === null || filtered === null) {
    return <Text color="red">No snapshot available.</Text>;
  }

  const mainContent = (
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
          {'  Tab: cycle  r: refresh  ?: help  q: quit'}
          {activeView === 'inbox' ? '  (inbox: p promote  x reject)' : ''}
        </Text>
      </Box>
      {activeView === 'roadmap' && <RoadmapView snapshot={filtered} isActive={!showHelp} />}
      {activeView === 'lineage' && <LineageView snapshot={filtered} isActive={!showHelp} />}
      {activeView === 'all' && <AllNodesView snapshot={filtered} isActive={!showHelp} />}
      {activeView === 'inbox' && (
        <InboxView
          snapshot={filtered}
          isActive={!showHelp}
          intake={intake}
          agentId={agentId}
          onMutationStart={() => setIsMutating(true)}
          onMutationEnd={() => setIsMutating(false)}
          onRefresh={refresh}
        />
      )}
    </Box>
  );

  if (showHelp) {
    return (
      <>
        {mainContent}
        <HelpModal />
      </>
    );
  }

  return mainContent;
}
