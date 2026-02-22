import type { ReactElement } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from './theme/index.js';

/**
 * HelpModal is a pure display component.
 * Keyboard handling (Escape to close) is managed by Dashboard.
 */
export function HelpModal(): ReactElement {
  const t = useTheme();

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={t.ink(t.theme.border.primary)} paddingX={1}>
      <Text bold color={t.ink(t.theme.ui.cursor)}>XYPH Help</Text>

      <Box marginTop={1} flexDirection="column">
        <Text bold color={t.ink(t.theme.semantic.warning)}>Glossary</Text>
        <Text dimColor>  Quest      — a unit of work with status, hours, and an owner</Text>
        <Text dimColor>  Intent     — a sovereign directive that authorizes quests</Text>
        <Text dimColor>  Campaign   — a milestone grouping related quests</Text>
        <Text dimColor>  Scroll     — an artifact produced when a quest is sealed DONE</Text>
        <Text dimColor>  Seal       — a cryptographic guild signature on a Scroll</Text>
        <Text dimColor>  Guild      — the collective of agents building the system</Text>
        <Text dimColor>  WARP       — the causal graph that is the single source of truth</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold color={t.ink(t.theme.semantic.warning)}>Key Bindings</Text>
        <Box flexDirection="row" marginTop={1}>
          <Box flexDirection="column" width={30}>
            <Text>{'  Tab       '}<Text dimColor>cycle views</Text></Text>
            <Text>{'  r         '}<Text dimColor>refresh</Text></Text>
            <Text>{'  ?         '}<Text dimColor>this help</Text></Text>
            <Text>{'  q         '}<Text dimColor>quit</Text></Text>
          </Box>
          <Box flexDirection="column">
            <Text>{'  ↑↓        '}<Text dimColor>navigate</Text></Text>
            <Text>{'  PgUp/PgDn '}<Text dimColor>page navigate</Text></Text>
            <Text>{'  Space     '}<Text dimColor>fold milestone / task detail</Text></Text>
            <Text>{'  p         '}<Text dimColor>promote (inbox, human.* only)</Text></Text>
            <Text>{'  x         '}<Text dimColor>reject (inbox)</Text></Text>
          </Box>
        </Box>
        <Box marginTop={1}>
          <Text>{'  Esc       '}<Text dimColor>close modal</Text></Text>
        </Box>
      </Box>

    </Box>
  );
}
