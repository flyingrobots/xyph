import type { ReactElement } from 'react';
import { Box, Text, useStdout } from 'ink';
import type { GraphMeta } from '../domain/models/dashboard.js';

/** StatusLine always renders exactly this many lines (status row + log row). */
export const STATUS_LINE_HEIGHT = 2;

interface Props {
  graphMeta?: GraphMeta;
  prevGraphMeta?: GraphMeta;
  logLine?: string;
}

export function StatusLine({ graphMeta, prevGraphMeta, logLine }: Props): ReactElement {
  const { stdout } = useStdout();
  const cols = stdout.columns ?? 80;

  let tag: string;
  if (graphMeta === undefined) {
    tag = '/// XYPH [--] ';
  } else {
    tag = `/// XYPH [t=${graphMeta.maxTick}`;
    if (
      prevGraphMeta !== undefined &&
      prevGraphMeta.maxTick !== graphMeta.maxTick
    ) {
      tag += ` \u2190 ${prevGraphMeta.maxTick}`;
    }
    tag += '] ';
  }

  const pad = Math.max(0, cols - tag.length);
  const statusRow = tag + '/'.repeat(pad);

  // M-6: Use tick instead of unstable checkpoint SHA in log prefix
  // M-2: Always render 2 lines to keep gutterLines stable
  let logRow: string;
  if (logLine) {
    const tick = graphMeta !== undefined ? `t=${graphMeta.maxTick}` : '--';
    const prefix = `[warp(${tick})] `;
    const maxMsg = cols - prefix.length;
    const msg = logLine.length > maxMsg ? logLine.slice(0, maxMsg - 1) + '…' : logLine;
    logRow = prefix + msg;
  } else {
    logRow = '';
  }

  return (
    <Box flexDirection="column">
      <Text dimColor>{statusRow}</Text>
      <Text dimColor>{logRow}</Text>
    </Box>
  );
}
