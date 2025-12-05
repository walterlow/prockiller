import React, { useState, useCallback, useEffect } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Banner } from './components/Banner.js';
import { PortInput } from './components/PortInput.js';
import { Spinner } from './components/Spinner.js';
import { ProcessTable } from './components/ProcessTable.js';
import { ConfirmDialog } from './components/ConfirmDialog.js';
import { StatusBar } from './components/StatusBar.js';
import { ResultMessage } from './components/ResultMessage.js';
import { ErrorDisplay } from './components/ErrorDisplay.js';
import { usePortScanner } from './hooks/usePortScanner.js';
import { useUpdateChecker } from './hooks/useUpdateChecker.js';

type AppState = 'input' | 'scanning' | 'results' | 'confirm' | 'confirm-all' | 'result-message' | 'error';

interface ResultState {
  success: boolean;
  message: string;
}

export function App() {
  const { exit } = useApp();
  const [appState, setAppState] = useState<AppState>('input');
  const [currentPort, setCurrentPort] = useState<number>(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [result, setResult] = useState<ResultState | null>(null);
  const { state: scanState, processes, error, scan, kill, killAll, reset } = usePortScanner();
  const updateResult = useUpdateChecker();

  // Handle error state transitions
  useEffect(() => {
    if (scanState === 'error' && error) {
      setAppState('error');
    }
  }, [scanState, error]);

  // Handle global keyboard shortcuts
  useInput((input, key) => {
    if (input === 'q' || input === 'Q') {
      if (appState === 'results') {
        exit();
      }
    } else if (input === 'r' || input === 'R') {
      if (appState === 'results' && currentPort > 0) {
        handlePortSubmit(currentPort);
      }
    } else if (input === 'a' || input === 'A') {
      if (appState === 'results' && processes.length > 1) {
        setAppState('confirm-all');
      }
    } else if (key.escape) {
      if (appState === 'confirm' || appState === 'confirm-all') {
        setAppState('results');
      } else if (appState === 'results' || appState === 'error') {
        setAppState('input');
        reset();
      }
    }
  });

  const handlePortSubmit = useCallback(async (port: number) => {
    // Guard against re-submission during active operations
    if (appState === 'scanning') {
      return;
    }

    setCurrentPort(port);
    setAppState('scanning');
    setSelectedIndex(0);
    await scan(port);
    // Only transition to results if not in error state
    if (scanState !== 'error') {
      setAppState('results');
    }
  }, [scan, appState, scanState]);

  const handleErrorDismiss = useCallback(() => {
    setAppState('input');
    reset();
  }, [reset]);

  const handleErrorRetry = useCallback(() => {
    if (currentPort > 0) {
      handlePortSubmit(currentPort);
    }
  }, [currentPort, handlePortSubmit]);

  const handleKillRequest = useCallback(() => {
    if (processes.length > 0) {
      setAppState('confirm');
    }
  }, [processes]);

  const handleKillConfirm = useCallback(async () => {
    const proc = processes[selectedIndex];
    if (proc) {
      const killResult = await kill(proc.pid);
      setResult(killResult);
      setAppState('result-message');
    }
  }, [processes, selectedIndex, kill]);

  const handleKillAllConfirm = useCallback(async () => {
    const killResult = await killAll();
    setResult(killResult);
    setAppState('result-message');
  }, [killAll]);

  const handleKillCancel = useCallback(() => {
    setAppState('results');
  }, []);

  const handleResultDismiss = useCallback(() => {
    setResult(null);
    if (processes.length > 0) {
      setAppState('results');
      // Adjust selection if needed
      if (selectedIndex >= processes.length) {
        setSelectedIndex(Math.max(0, processes.length - 1));
      }
    } else {
      setAppState('input');
      reset();
    }
  }, [processes, selectedIndex, reset]);

  const getStatusBarMode = (): 'input' | 'scanning' | 'results' | 'confirm' => {
    if (appState === 'result-message') return 'results';
    if (appState === 'confirm-all') return 'confirm';
    if (appState === 'error') return 'input';
    return appState;
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Banner />

      {updateResult.status === 'checking' && (
        <Box marginBottom={1}>
          <Text dimColor>Checking for updates...</Text>
        </Box>
      )}

      {updateResult.status === 'updating' && (
        <Box marginBottom={1}>
          <Text color="#4a9eff">Updating...</Text>
        </Box>
      )}

      {updateResult.message && (
        <Box marginBottom={1}>
          {updateResult.success ? (
            <Text color="#4a9eff">✓ {updateResult.message}</Text>
          ) : (
            <Text color="#ffa500">⚠ {updateResult.message}</Text>
          )}
        </Box>
      )}

      {appState === 'input' && (
        <PortInput onSubmit={handlePortSubmit} />
      )}

      {appState === 'error' && error && (
        <ErrorDisplay
          message={error}
          onRetry={handleErrorRetry}
          onDismiss={handleErrorDismiss}
        />
      )}

      {appState === 'scanning' && (
        <Spinner port={currentPort} />
      )}

      {(appState === 'results' || appState === 'confirm' || appState === 'confirm-all' || appState === 'result-message') && (
        <>
          <ProcessTable
            processes={processes}
            selectedIndex={selectedIndex}
            onSelect={setSelectedIndex}
            onKill={handleKillRequest}
          />

          {appState === 'confirm' && processes[selectedIndex] && (
            <ConfirmDialog
              process={processes[selectedIndex]}
              onConfirm={handleKillConfirm}
              onCancel={handleKillCancel}
            />
          )}

          {appState === 'confirm-all' && (
            <ConfirmDialog
              processCount={processes.length}
              onConfirm={handleKillAllConfirm}
              onCancel={handleKillCancel}
            />
          )}

          {appState === 'result-message' && result && (
            <ResultMessage
              success={result.success}
              message={result.message}
              onDismiss={handleResultDismiss}
            />
          )}
        </>
      )}

      <StatusBar mode={getStatusBarMode()} processCount={processes.length} />
    </Box>
  );
}
