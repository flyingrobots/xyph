import type { ReactElement } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from './theme/index.js';

/**
 * Props for the vertical scrollbar.
 * `visible` must match the content pane height (the number of rows
 * rendered in the scrollable list) for the thumb to track correctly.
 */
interface Props {
  total: number;   // total vrow count
  visible: number; // listHeight (rows that fit on screen)
  offset: number;  // current scroll offset
}

/**
 * Vertical scrollbar — renders a single column of characters.
 * Returns null when all rows fit and scrolling is not needed.
 */
export function Scrollbar({ total, visible, offset }: Props): ReactElement | null {
  const t = useTheme();

  if (total <= visible) return null;

  const thumbSize = Math.max(1, Math.round(visible * visible / total));
  const trackLen = visible - thumbSize;
  const thumbStart = Math.min(
    trackLen,
    Math.floor((offset / Math.max(1, total - visible)) * trackLen)
  );

  return (
    <Box flexDirection="column" marginLeft={1}>
      {Array.from({ length: visible }, (_, i) => {
        const inThumb = i >= thumbStart && i < thumbStart + thumbSize;
        return (
          <Text key={i} color={inThumb ? t.ink(t.theme.ui.scrollThumb) : t.ink(t.theme.ui.scrollTrack)}>
            {inThumb ? '█' : '░'}
          </Text>
        );
      })}
    </Box>
  );
}
