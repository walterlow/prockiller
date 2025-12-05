import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { validatePort } from '../utils/validation.js';

interface PortInputProps {
  onSubmit: (port: number) => void;
  disabled?: boolean;
}

export function PortInput({ onSubmit, disabled = false }: PortInputProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (input: string) => {
    if (disabled) return;

    const validation = validatePort(input);

    if (!validation.valid) {
      setError(validation.error || 'Invalid port');
      return;
    }

    setError(null);
    onSubmit(parseInt(input, 10));
  };

  return (
    <Box flexDirection="column" marginY={1}>
      <Box>
        <Text color="#ff8c00" bold>{'❯ '}</Text>
        <Text>Enter port to scan: </Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          placeholder="3000"
        />
      </Box>
      {error && (
        <Box marginTop={1}>
          <Text color="#ff4500">  ✗ {error}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>  Press Enter to scan</Text>
      </Box>
    </Box>
  );
}
