import React from 'react';
import { Box, Text, useStdout } from 'ink';
import { getCurrentVersion } from '../utils/version.js';

// Each letter as separate array of lines for fixed-width rendering
const LETTERS: Record<string, string[]> = {
  P: [
    '██████╗ ',
    '██╔══██╗',
    '██████╔╝',
    '██╔═══╝ ',
    '██║     ',
    '╚═╝     ',
  ],
  R: [
    '██████╗ ',
    '██╔══██╗',
    '██████╔╝',
    '██╔══██╗',
    '██║  ██║',
    '╚═╝  ╚═╝',
  ],
  O: [
    ' ██████╗ ',
    '██╔═══██╗',
    '██║   ██║',
    '██║   ██║',
    '╚██████╔╝',
    ' ╚═════╝ ',
  ],
  C: [
    ' ██████╗',
    '██╔════╝',
    '██║     ',
    '██║     ',
    '╚██████╗',
    ' ╚═════╝',
  ],
  K: [
    '██╗  ██╗',
    '██║ ██╔╝',
    '█████╔╝ ',
    '██╔═██╗ ',
    '██║  ██╗',
    '╚═╝  ╚═╝',
  ],
  I: [
    '██╗',
    '██║',
    '██║',
    '██║',
    '██║',
    '╚═╝',
  ],
  L: [
    '██╗     ',
    '██║     ',
    '██║     ',
    '██║     ',
    '███████╗',
    '╚══════╝',
  ],
  E: [
    '███████╗',
    '██╔════╝',
    '█████╗  ',
    '██╔══╝  ',
    '███████╗',
    '╚══════╝',
  ],
};

const PROC = ['P', 'R', 'O', 'C'];
const KILLER = ['K', 'I', 'L', 'L', 'E', 'R'];

const COLORS = ['#ff4500', '#ff6a00', '#ff8c00', '#ffa500', '#ffb732', '#ffcc66'];

function AsciiWord({ letters }: { letters: string[] }) {
  return (
    <Box flexDirection="row">
      {letters.map((letter, colIdx) => (
        <Box key={colIdx} flexDirection="column">
          {LETTERS[letter]!.map((line, rowIdx) => (
            <Text key={rowIdx} color={COLORS[rowIdx % COLORS.length]} bold>
              {line}
            </Text>
          ))}
        </Box>
      ))}
    </Box>
  );
}

const MIN_WIDTH_FULL_BANNER = 50;
const MIN_WIDTH_COMPACT_BANNER = 30;

export function Banner() {
  const { stdout } = useStdout();
  // Handle edge case where stdout.columns is undefined, 0, or negative
  const rawWidth = stdout?.columns;
  const width = (typeof rawWidth === 'number' && rawWidth > 0) ? rawWidth : 80;
  const version = getCurrentVersion();

  // Full ASCII art banner
  if (width >= MIN_WIDTH_FULL_BANNER) {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Box marginLeft={2}>
          <AsciiWord letters={PROC} />
        </Box>
        <Box marginLeft={2}>
          <AsciiWord letters={KILLER} />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>  Find and kill processes hogging your ports.  </Text>
          <Text color="#666666">[{version}]</Text>
        </Box>
      </Box>
    );
  }

  // Compact text banner for narrow terminals
  if (width >= MIN_WIDTH_COMPACT_BANNER) {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text color="#ff6a00" bold>PROCKILLER</Text>
          <Text dimColor> </Text>
          <Text color="#666666">[{version}]</Text>
        </Box>
        <Text dimColor>Find and kill processes.</Text>
      </Box>
    );
  }

  // Minimal banner for very narrow terminals
  return (
    <Box marginBottom={1}>
      <Text color="#ff6a00" bold>PROCKILLER</Text>
      <Text dimColor> </Text>
      <Text color="#666666">[{version}]</Text>
    </Box>
  );
}
