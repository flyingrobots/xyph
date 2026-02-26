import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { ReactElement } from 'react';
import { Box, Text, useInput, useApp, useStdout, type Key } from 'ink';
import type { GraphContext } from '../infrastructure/GraphContext.js';
import type { GraphSnapshot, GraphMeta } from '../domain/models/dashboard.js';
import type { IntakePort } from '../ports/IntakePort.js';
import { RoadmapView } from './views/RoadmapView.js';
import { LineageView } from './views/LineageView.js';
import { AllNodesView } from './views/AllNodesView.js';
import { InboxView } from './views/InboxView.js';
import { LandingView } from './views/LandingView.js';
import { HelpModal } from './HelpModal.js';
import { StatusLine, STATUS_LINE_HEIGHT } from './StatusLine.js';
import { useTheme } from './theme/index.js';
import type { TuiLogger } from './TuiLogger.js';

type ViewName = 'roadmap' | 'lineage' | 'all' | 'inbox';

const VIEWS: ViewName[] = ['roadmap', 'lineage', 'all', 'inbox'];

interface Props {
  ctx: GraphContext;
  intake: IntakePort;
  agentId: string;
  logoText: string;
  wordmarkText: string;
  wordmarkLines: number;
  logger?: TuiLogger;
}

export function Dashboard({ ctx, intake, agentId, logoText, wordmarkText, wordmarkLines, logger }: Props): ReactElement {
  const t = useTheme();
  const [activeView, setActiveView] = useState<ViewName>('roadmap');
  const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [showLanding, setShowLanding] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [loadLog, setLoadLog] = useState<string[]>([]);
  const [logLine, setLogLine] = useState('');
  const { exit } = useApp();
  const { stdout } = useStdout();

  const requestCounter = useRef(0);
  const prevMeta = useRef<GraphMeta | undefined>(undefined);

  // Subscribe to TuiLogger for git-warp verbose output.
  // Throttle updates to avoid rapid re-renders that cause terminal flashing.
  const pendingLogRef = useRef<string | null>(null);
  const logTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!logger) return;
    logger.onEntry = (entry): void => {
      pendingLogRef.current = entry.message;
      if (logTimerRef.current === null) {
        logTimerRef.current = setTimeout(() => {
          logTimerRef.current = null;
          if (pendingLogRef.current !== null) {
            setLogLine(pendingLogRef.current);
            pendingLogRef.current = null;
          }
        }, 150);
      }
    };
    return (): void => {
      logger.onEntry = null;
      if (logTimerRef.current !== null) {
        clearTimeout(logTimerRef.current);
        logTimerRef.current = null;
      }
    };
  }, [logger]);

  const refresh = useCallback((showLoading = false): void => {
    if (showLoading) setLoading(true);
    const thisRequest = ++requestCounter.current;
    const onProgress = showLoading
      ? (msg: string): void => {
          setLoadLog((prev) => [...prev.slice(-9), msg]);
        }
      : undefined;
    ctx
      .fetchSnapshot(onProgress)
      .then((s) => {
        if (requestCounter.current !== thisRequest) return; // stale response
        setSnapshot((prev) => {
          prevMeta.current = prev?.graphMeta;
          return s;
        });
        setLoadLog([]);
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
  }, [ctx]);

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
    () => snapshot ? ctx.filterSnapshot(snapshot, { includeGraveyard: false }) : null,
    [ctx, snapshot],
  );
  const wordmarkLinesArray = useMemo(() => wordmarkText.split('\n'), [wordmarkText]);

  const rows = stdout.rows ?? 24;

  // Gutter height must match StatusLine's rendered line count.
  // IMPORTANT: StatusLine must always render exactly 2 lines — see StatusLine.tsx.
  const gutterLines = STATUS_LINE_HEIGHT;

  // Resolve which content to render and what graphMeta to show in gutter
  let content: ReactElement;
  let graphMeta: GraphMeta | undefined;

  if (showHelp) {
    // H-2: Render HelpModal AS the content area so it doesn't overflow height={rows}
    graphMeta = filtered?.graphMeta;
    content = <HelpModal />;
  } else if (showLanding && error === null) {
    content = <LandingView logoText={logoText} snapshot={snapshot} loadLog={loadLog} />;
  } else if (loading) {
    content = (
      <Box flexGrow={1} alignItems="center" justifyContent="center">
        <Text color={t.ink(t.theme.semantic.warning)}>Loading project graph snapshot…</Text>
      </Box>
    );
  } else if (error !== null) {
    content = (
      <Box flexGrow={1} alignItems="center" justifyContent="center">
        <Text color={t.ink(t.theme.semantic.error)}>Error: {error}</Text>
      </Box>
    );
  } else if (snapshot === null || filtered === null) {
    content = (
      <Box flexGrow={1} alignItems="center" justifyContent="center">
        <Text color={t.ink(t.theme.semantic.error)}>No snapshot available.</Text>
      </Box>
    );
  } else {
    graphMeta = filtered.graphMeta;

    // L-5: cols only needed in this branch for layout calculations
    const cols = stdout.columns ?? 80;
    const showWordmark = cols >= 50;
    // Chrome: header row height (max of 2-line tab column or wordmark) + margins + indicators + gutter
    const tabColumnHeight = 2; // tab labels row + hints row
    const headerHeight = showWordmark ? Math.max(tabColumnHeight, wordmarkLines) : tabColumnHeight;
    const chromeLines = headerHeight + 1 /* marginBottom */ + 1 /* scroll indicator */ + gutterLines;

    content = (
      <Box flexDirection="column" flexGrow={1}>
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
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height={rows}>
      <Box flexDirection="column" flexGrow={1}>
        {content}
      </Box>
      <StatusLine graphMeta={graphMeta} prevGraphMeta={prevMeta.current} logLine={logLine} />
    </Box>
  );
}
