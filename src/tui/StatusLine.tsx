import type { ReactElement } from 'react';
import { Text, useStdout } from 'ink';
import type { GraphMeta } from '../domain/models/dashboard.js';

interface Props {
  graphMeta?: GraphMeta;
  prevGraphMeta?: GraphMeta;
}

export function StatusLine({ graphMeta, prevGraphMeta }: Props): ReactElement {
  const { stdout } = useStdout();
  const cols = stdout.columns ?? 80;

  if (graphMeta === undefined) {
    const prefix = '/// WARP [--] ';
    const empty = prefix + '/'.repeat(Math.max(0, cols - prefix.length));
    return <Text dimColor>{empty}</Text>;
  }

  let tag = `/// WARP [tick: ${graphMeta.maxTick} (${graphMeta.tipSha})`;

  if (
    prevGraphMeta !== undefined &&
    prevGraphMeta.maxTick !== graphMeta.maxTick
  ) {
    tag += ` \u2190 ${prevGraphMeta.maxTick} (${prevGraphMeta.tipSha})`;
  }

  tag += ` | me: ${graphMeta.myTick} | writers: ${graphMeta.writerCount}] `;

  const pad = Math.max(0, cols - tag.length);
  const line = tag + '/'.repeat(pad);

  return <Text dimColor>{line}</Text>;
}
