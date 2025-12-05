import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const DEFAULT_SCAN_TIMEOUT = 10000; // 10 seconds
const DEFAULT_KILL_TIMEOUT = 5000;  // 5 seconds

export interface ProcessInfo {
  pid: number;
  name: string;
  port: number;
  protocol: string;
  localAddress: string;
}

export interface TimeoutOptions {
  scanTimeout?: number;
  killTimeout?: number;
}

interface ParsedNetstatLine {
  protocol: string;
  localAddress: string;
  pid: number;
}

interface ParsedLsofLine {
  name: string;
  pid: number;
  protocol: string;
  localAddress: string;
}

// Exported for testing
export function parseNetstatLine(line: string, targetPort: number): ParsedNetstatLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(/\s+/);

  // Netstat format: PROTO LOCAL_ADDR FOREIGN_ADDR STATE PID
  // or: PROTO LOCAL_ADDR FOREIGN_ADDR PID (for UDP)
  if (parts.length < 4) return null;

  const protocol = parts[0]?.toUpperCase();
  if (!protocol || !['TCP', 'UDP'].includes(protocol)) return null;

  const localAddress = parts[1];
  if (!localAddress) return null;

  // Extract port from local address, handling IPv6 brackets
  // Examples: 0.0.0.0:3000, [::]:3000, [::1]:3000, [fe80::1%12]:3000
  const portMatch = localAddress.match(/:(\d+)$/);
  if (!portMatch) return null;

  const foundPort = parseInt(portMatch[1], 10);
  if (foundPort !== targetPort) return null;

  // PID is always the last column
  const pidStr = parts[parts.length - 1];
  const pid = parseInt(pidStr, 10);

  // Validate PID is a positive integer
  if (isNaN(pid) || pid <= 0 || !Number.isInteger(pid)) return null;

  return { protocol, localAddress, pid };
}

// Exported for testing
export function parseLsofLine(line: string): ParsedLsofLine | null {
  const parts = line.split(/\s+/);
  if (parts.length < 9) return null;

  const name = parts[0];
  const pid = parseInt(parts[1], 10);
  const protocol = parts[7]?.includes('TCP') ? 'TCP' : 'UDP';
  const localAddress = parts[8] || '';

  if (!name || isNaN(pid) || pid <= 0) return null;

  return { name, pid, protocol, localAddress };
}

async function execWithTimeout(
  command: string,
  timeout: number
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Command timed out after ${timeout}ms`));
    }, timeout);

    execAsync(command)
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

export async function findProcessesByPort(
  port: number,
  options: TimeoutOptions = {}
): Promise<ProcessInfo[]> {
  const isWindows = process.platform === 'win32';

  if (isWindows) {
    return findProcessesByPortWindows(port, options);
  } else {
    return findProcessesByPortUnix(port, options);
  }
}

async function findProcessesByPortWindows(
  port: number,
  options: TimeoutOptions = {}
): Promise<ProcessInfo[]> {
  const timeout = options.scanTimeout ?? DEFAULT_SCAN_TIMEOUT;

  try {
    // Get network connections with PIDs
    const { stdout: netstatOutput } = await execWithTimeout(
      `netstat -ano | findstr :${port}`,
      timeout
    );
    const lines = netstatOutput.trim().split('\n').filter((line: string) => line.trim());

    const pidSet = new Set<number>();
    const connections: ParsedNetstatLine[] = [];

    for (const line of lines) {
      const parsed = parseNetstatLine(line, port);
      if (parsed && !pidSet.has(parsed.pid)) {
        pidSet.add(parsed.pid);
        connections.push(parsed);
      }
    }

    // Get process names for each PID
    const processes: ProcessInfo[] = [];
    for (const conn of connections) {
      try {
        const { stdout: tasklistOutput } = await execWithTimeout(
          `tasklist /FI "PID eq ${conn.pid}" /FO CSV /NH`,
          timeout
        );
        const match = tasklistOutput.match(/"([^"]+)"/);
        const name = match ? match[1] : 'Unknown';

        processes.push({
          pid: conn.pid,
          name,
          port,
          protocol: conn.protocol,
          localAddress: conn.localAddress,
        });
      } catch {
        processes.push({
          pid: conn.pid,
          name: 'Unknown',
          port,
          protocol: conn.protocol,
          localAddress: conn.localAddress,
        });
      }
    }

    return processes;
  } catch (error) {
    // Re-throw timeout errors so they can be handled by the UI
    if (error instanceof Error && error.message.includes('timed out')) {
      throw error;
    }
    // Empty result for "no processes found" (findstr returns error when no match)
    return [];
  }
}

async function findProcessesByPortUnix(
  port: number,
  options: TimeoutOptions = {}
): Promise<ProcessInfo[]> {
  const timeout = options.scanTimeout ?? DEFAULT_SCAN_TIMEOUT;

  try {
    const { stdout } = await execWithTimeout(
      `lsof -i :${port} -P -n 2>/dev/null || true`,
      timeout
    );
    const lines = stdout.trim().split('\n').slice(1); // Skip header

    const processes: ProcessInfo[] = [];
    const pidSet = new Set<number>();

    for (const line of lines) {
      const parsed = parseLsofLine(line);
      if (parsed && !pidSet.has(parsed.pid)) {
        pidSet.add(parsed.pid);
        processes.push({
          pid: parsed.pid,
          name: parsed.name,
          port,
          protocol: parsed.protocol,
          localAddress: parsed.localAddress,
        });
      }
    }

    return processes;
  } catch (error) {
    // Re-throw timeout errors so they can be handled by the UI
    if (error instanceof Error && error.message.includes('timed out')) {
      throw error;
    }
    return [];
  }
}

export async function killProcess(
  pid: number,
  options: TimeoutOptions = {}
): Promise<{ success: boolean; message: string }> {
  const isWindows = process.platform === 'win32';
  const timeout = options.killTimeout ?? DEFAULT_KILL_TIMEOUT;

  try {
    if (isWindows) {
      await execWithTimeout(`taskkill /PID ${pid} /F`, timeout);
    } else {
      await execWithTimeout(`kill -9 ${pid}`, timeout);
    }
    return { success: true, message: `Process ${pid} terminated successfully` };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('timed out')) {
      return { success: false, message: `Kill operation timed out` };
    }
    if (message.includes('Access is denied') || message.includes('Operation not permitted')) {
      return { success: false, message: `Permission denied. Try running as administrator.` };
    }
    return { success: false, message: `Failed to kill process: ${message}` };
  }
}
