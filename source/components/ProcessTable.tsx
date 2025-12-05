import React from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { ProcessInfo } from '../utils/process.js';

interface ProcessTableProps {
  processes: ProcessInfo[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onKill: () => void;
}

const MIN_TERMINAL_WIDTH = 40;

function calculateColumnWidths(terminalWidth: number | undefined) {
  // Handle undefined/null terminal width and enforce minimum
  const safeWidth = Math.max(terminalWidth ?? 80, MIN_TERMINAL_WIDTH);

  // Fixed columns: selector (3) + pid (8) + protocol (8) + padding/borders (~6)
  const fixedWidth = 3 + 8 + 8 + 6;
  const availableWidth = Math.max(safeWidth - fixedWidth, 20);

  // Distribute remaining space between name and address
  // Name gets 40%, address gets 60%
  const nameWidth = Math.max(Math.floor(availableWidth * 0.4), 8);
  const addressWidth = Math.max(availableWidth - nameWidth, 10);

  return {
    pid: 8,
    name: nameWidth,
    protocol: 8,
    address: addressWidth,
  };
}

export function ProcessTable({ processes, selectedIndex, onSelect, onKill }: ProcessTableProps) {
  const { stdout } = useStdout();
  const colWidths = calculateColumnWidths(stdout?.columns);

  useInput((input, key) => {
    if (key.upArrow) {
      onSelect(Math.max(0, selectedIndex - 1));
    } else if (key.downArrow) {
      onSelect(Math.min(processes.length - 1, selectedIndex + 1));
    } else if (key.return || input === 'k' || input === 'K') {
      onKill();
    }
  });

  if (processes.length === 0) {
    return (
      <Box marginY={1} flexDirection="column">
        <Box
          borderStyle="round"
          borderColor="#ff8c00"
          paddingX={2}
          paddingY={1}
        >
          <Text color="#ff8c00">No processes found on this port</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginY={1}>
      {/* Header */}
      <Box
        borderStyle="round"
        borderColor="#ff6a00"
        paddingX={1}
      >
        <Box width={3}><Text> </Text></Box>
        <Box width={colWidths.pid}><Text color="#ff6a00" bold>PID</Text></Box>
        <Box width={colWidths.name}><Text color="#ff6a00" bold>PROCESS</Text></Box>
        <Box width={colWidths.protocol}><Text color="#ff6a00" bold>PROTO</Text></Box>
        <Box width={colWidths.address}><Text color="#ff6a00" bold>ADDRESS</Text></Box>
      </Box>

      {/* Rows */}
      {processes.map((proc, index) => {
        const isSelected = index === selectedIndex;

        return (
          <Box
            key={proc.pid}
            paddingX={1}
          >
            <Box width={3}>
              <Text color={isSelected ? '#ffa500' : '#333333'}>
                {isSelected ? '▸ ' : '  '}
              </Text>
            </Box>
            <Box width={colWidths.pid}>
              <Text color={isSelected ? '#ffa500' : '#ffb732'} bold={isSelected} inverse={isSelected}>
                {` ${proc.pid} `}
              </Text>
            </Box>
            <Box width={colWidths.name}>
              <Text color={isSelected ? '#ffa500' : '#ffffff'} bold={isSelected}>
                {proc.name.substring(0, colWidths.name - 1)}
              </Text>
            </Box>
            <Box width={colWidths.protocol}>
              <Text color={isSelected ? '#ffa500' : '#ffcc66'}>
                {proc.protocol}
              </Text>
            </Box>
            <Box width={colWidths.address}>
              <Text color={isSelected ? '#ffa500' : '#888888'} dimColor={!isSelected}>
                {proc.localAddress.substring(0, colWidths.address - 1)}
              </Text>
            </Box>
          </Box>
        );
      })}

      <Box marginTop={1}>
        <Text dimColor>
          Found <Text color="#ffa500" bold>{processes.length}</Text> process{processes.length !== 1 ? 'es' : ''}
        </Text>
      </Box>
    </Box>
  );
}
