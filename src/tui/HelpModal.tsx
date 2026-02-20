import type { ReactElement } from 'react';
import { Box, Text } from 'ink';

/**
 * HelpModal is a pure display component.
 * Keyboard handling (Escape to close) is managed by Dashboard.
 */
export function HelpModal(): ReactElement {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text bold color="cyan">XYPH Help</Text>

      <Box marginTop={1} flexDirection="column">
        <Text bold color="yellow">Glossary</Text>
        <Text dimColor>  Quest      — a unit of work with status, hours, and an owner</Text>
        <Text dimColor>  Intent     — a sovereign directive that authorizes quests</Text>
        <Text dimColor>  Campaign   — a milestone grouping related quests</Text>
        <Text dimColor>  Scroll     — an artifact produced when a quest is sealed DONE</Text>
        <Text dimColor>  Seal       — a cryptographic guild signature on a Scroll</Text>
        <Text dimColor>  Guild      — the collective of agents building the system</Text>
        <Text dimColor>  WARP       — the causal graph that is the single source of truth</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold color="yellow">Key Bindings</Text>
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
