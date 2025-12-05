import React from 'react';
import { Box, Text, useInput } from 'ink';

interface ErrorDisplayProps {
  message: string;
  onRetry?: () => void;
  onDismiss: () => void;
}

export function ErrorDisplay({ message, onRetry, onDismiss }: ErrorDisplayProps) {
  useInput((input, key) => {
    if (input === 'r' || input === 'R') {
      onRetry?.();
    } else if (key.escape || input === 'q' || input === 'Q') {
      onDismiss();
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="#ff4500"
      paddingX={2}
      paddingY={1}
      marginY={1}
    >
      <Box marginBottom={1}>
        <Text color="#ff4500" bold>
          ✗ Error
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text>{message}</Text>
      </Box>

      <Box>
        <Text dimColor>
          {onRetry && (
            <>
              Press <Text color="#ffa500" bold>[R]</Text> to retry
              {' or '}
            </>
          )}
          <Text color="#ff4500" bold>[Esc]</Text> to go back
        </Text>
      </Box>
    </Box>
  );
}
