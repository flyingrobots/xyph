import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { ReactElement } from 'react';
import { Box, Text, useInput, useApp, useStdout, type Key } from 'ink';
import type { DashboardService } from '../domain/services/DashboardService.js';
import type { GraphSnapshot, GraphMeta } from '../domain/models/dashboard.js';
import type { IntakePort } from '../ports/IntakePort.js';
import { RoadmapView } from './views/RoadmapView.js';
import { LineageView } from './views/LineageView.js';
import { AllNodesView } from './views/AllNodesView.js';
import { InboxView } from './views/InboxView.js';
import { LandingView } from './views/LandingView.js';
import { HelpModal } from './HelpModal.js';
import { StatusLine } from './StatusLine.js';
import { useTheme } from './theme/index.js';

type ViewName = 'roadmap' | 'lineage' | 'all' | 'inbox';

const VIEWS: ViewName[] = ['roadmap', 'lineage', 'all', 'inbox'];

interface Props {
  service: DashboardService;
  intake: IntakePort;
  agentId: string;
  logoText: string;
  wordmarkText: string;
  wordmarkLines: number;
}

export function Dashboard({ service, intake, agentId, logoText, wordmarkText, wordmarkLines }: Props): ReactElement {
  const t = useTheme();
  const [activeView, setActiveView] = useState<ViewName>('roadmap');
  const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [showLanding, setShowLanding] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [loadLog, setLoadLog] = useState<string[]>([]);
  const { exit } = useApp();
  const { stdout } = useStdout();

  const requestCounter = useRef(0);
  const prevMeta = useRef<GraphMeta | undefined>(undefined);

  const refresh = useCallback((showLoading = false): void => {
    if (showLoading) setLoading(true);
    const thisRequest = ++requestCounter.current;
    const onProgress = showLoading
      ? (msg: string) => {
          setLoadLog((prev) => [...prev.slice(-9), msg]);
        }
      : undefined;
    service
      .getSnapshot(onProgress)
      .then((s) => {
        if (requestCounter.current !== thisRequest) return; // stale response
        setSnapshot((prev) => {
          prevMeta.current = prev?.graphMeta;
          return s;
        });
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
    refresh(true);
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
      return;
    }
  });

  // NOTE: All useMemo/useEffect calls must be above early returns (Rules of Hooks)
  const filtered = useMemo(
    () => snapshot ? service.filterSnapshot(snapshot, { includeGraveyard: false }) : null,
    [service, snapshot],
  );
  const wordmarkLinesArray = useMemo(() => wordmarkText.split('\n'), [wordmarkText]);

  // Landing screen — shown until user presses any key (unless error occurred)
  if (showLanding && error === null) {
    return <LandingView logoText={logoText} snapshot={snapshot} loadLog={loadLog} />;
  }

  if (loading) {
    return <Text color={t.ink(t.theme.semantic.warning)}>Loading project graph snapshot…</Text>;
  }

  if (error !== null) {
    return <Text color={t.ink(t.theme.semantic.error)}>Error: {error}</Text>;
  }

  if (snapshot === null || filtered === null) {
    return <Text color={t.ink(t.theme.semantic.error)}>No snapshot available.</Text>;
  }

  const cols = stdout.columns ?? 80;
  const showWordmark = cols >= 50;
  // Chrome: header row height (max of 2-line tab column or wordmark) + margins + indicators
  const tabColumnHeight = 2; // tab labels row + hints row
  const headerHeight = showWordmark ? Math.max(tabColumnHeight, wordmarkLines) : tabColumnHeight;
  const chromeLines = headerHeight + 1 /* marginBottom */ + 1 /* scroll indicator */ + 1 /* status line */;

  const mainContent = (
    <Box flexDirection="column">
      <Box flexDirection="row" alignItems="flex-start" marginBottom={1}>
        <Box flexGrow={1} flexDirection="column">
          <Box>
            {VIEWS.map((v) => (
              <Box key={v} marginRight={2}>
                <Text
                  bold={v === activeView}
                  color={v === activeView ? t.ink(t.theme.ui.cursor) : t.ink(t.theme.semantic.muted)}
                >
                  {v === activeView ? `[${v}]` : v}
                </Text>
              </Box>
            ))}
          </Box>
          <Text dimColor>
            {'Tab: cycle  r: refresh  ?: help  q: quit'}
            {activeView === 'inbox' ? '  p: promote  x: reject' : ''}
          </Text>
        </Box>
        {showWordmark && (
          <Box flexDirection="column">
            {wordmarkLinesArray.map((line, i) => (
              <Text key={i} dimColor>{line}</Text>
            ))}
          </Box>
        )}
      </Box>
      {/* DESIGN NOTE (M-26): Each view receives isActive={!showHelp} so its useInput
         handler can gate on isActive, preventing keypress theft when the help modal
         is open. This is a convention — new views MUST pass { isActive } to useInput.
         (M-27): Conditional && rendering unmounts/remounts views on tab switch,
         resetting internal state (scroll, selection, fold). Ink lacks CSS display:none;
         persistent state would require lifting it to Dashboard or a shared store. */}
      {activeView === 'roadmap' && <RoadmapView snapshot={filtered} isActive={!showHelp} chromeLines={chromeLines} />}
      {activeView === 'lineage' && <LineageView snapshot={filtered} isActive={!showHelp} chromeLines={chromeLines} />}
      {activeView === 'all' && <AllNodesView snapshot={filtered} isActive={!showHelp} chromeLines={chromeLines} />}
      {activeView === 'inbox' && (
        <InboxView
          snapshot={filtered}
          isActive={!showHelp}
          intake={intake}
          agentId={agentId}
          onMutationStart={() => setIsMutating(true)}
          onMutationEnd={() => setIsMutating(false)}
          onRefresh={refresh}
          chromeLines={chromeLines}
        />
      )}
      <StatusLine graphMeta={filtered.graphMeta} prevGraphMeta={prevMeta.current} />
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
