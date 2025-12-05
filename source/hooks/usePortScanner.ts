import { useState, useCallback } from 'react';
import { findProcessesByPort, killProcess, ProcessInfo } from '../utils/process.js';

export type ScanState = 'idle' | 'scanning' | 'done' | 'error';

export interface UsePortScannerResult {
  state: ScanState;
  processes: ProcessInfo[];
  error: string | null;
  scan: (port: number) => Promise<void>;
  kill: (pid: number) => Promise<{ success: boolean; message: string }>;
  killAll: () => Promise<{ success: boolean; message: string }>;
  reset: () => void;
}

export function usePortScanner(): UsePortScannerResult {
  const [state, setState] = useState<ScanState>('idle');
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const scan = useCallback(async (port: number) => {
    setState('scanning');
    setError(null);
    setProcesses([]);

    try {
      // Add a small delay for the animation to be visible
      await new Promise(resolve => setTimeout(resolve, 800));
      const result = await findProcessesByPort(port);
      setProcesses(result);
      setState('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setState('error');
    }
  }, []);

  const kill = useCallback(async (pid: number) => {
    const result = await killProcess(pid);
    if (result.success) {
      setProcesses(prev => prev.filter(p => p.pid !== pid));
    }
    return result;
  }, []);

  const killAll = useCallback(async () => {
    // Capture current processes at call time
    const currentProcesses = [...processes];

    if (currentProcesses.length === 0) {
      return { success: false, message: 'No processes to kill' };
    }

    // Kill all processes in parallel
    const results = await Promise.allSettled(
      currentProcesses.map(proc => killProcess(proc.pid))
    );

    let killed = 0;
    let failed = 0;
    const errors: string[] = [];
    const killedPids: number[] = [];

    results.forEach((result, index) => {
      const proc = currentProcesses[index];
      if (result.status === 'fulfilled' && result.value.success) {
        killed++;
        killedPids.push(proc.pid);
      } else {
        failed++;
        const message = result.status === 'rejected'
          ? result.reason?.message || 'Unknown error'
          : result.value.message;
        errors.push(`${proc.name} (${proc.pid}): ${message}`);
      }
    });

    // Only remove successfully killed processes
    setProcesses(prev => prev.filter(p => !killedPids.includes(p.pid)));

    if (failed === 0) {
      return { success: true, message: `Killed all ${killed} process${killed !== 1 ? 'es' : ''}` };
    } else if (killed === 0) {
      return { success: false, message: `Failed to kill any processes. ${errors[0]}` };
    } else {
      return { success: true, message: `Killed ${killed}, failed ${failed}: ${errors.slice(0, 2).join('; ')}` };
    }
  }, [processes]);

  const reset = useCallback(() => {
    setState('idle');
    setProcesses([]);
    setError(null);
  }, []);

  return { state, processes, error, scan, kill, killAll, reset };
}
