import type { ReactElement } from 'react';
import { Box, Text, useStdout } from 'ink';
import type { GraphMeta } from '../domain/models/dashboard.js';

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

  // Build enriched log prefix: [warp(SHA)] or [warp(--)]
  let logRow: string | undefined;
  if (logLine) {
    const sha = graphMeta?.tipSha ?? '--';
    const prefix = `[warp(${sha})] `;
    const maxMsg = cols - prefix.length;
    const msg = logLine.length > maxMsg ? logLine.slice(0, maxMsg - 1) + '…' : logLine;
    logRow = prefix + msg;
  }

  if (!logRow) {
    return <Text dimColor>{statusRow}</Text>;
  }

  return (
    <Box flexDirection="column">
      <Text dimColor>{statusRow}</Text>
      <Text dimColor>{logRow}</Text>
    </Box>
  );
}
