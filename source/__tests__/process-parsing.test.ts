import { parseNetstatLine, parseLsofLine } from '../utils/process.js';
import {
  NETSTAT_SINGLE_PROCESS,
  NETSTAT_MULTIPLE_PROCESSES,
  NETSTAT_MALFORMED,
  NETSTAT_IPV6,
  NETSTAT_TIME_WAIT,
} from './fixtures/netstat-output.js';
import {
  LSOF_SINGLE_PROCESS,
  LSOF_MULTIPLE_PROCESSES,
  LSOF_MALFORMED,
  LSOF_UDP,
} from './fixtures/lsof-output.js';

describe('parseNetstatLine', () => {
  it('should parse valid TCP line', () => {
    const line = '  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       12345';
    const result = parseNetstatLine(line, 3000);

    expect(result).toEqual({
      protocol: 'TCP',
      localAddress: '0.0.0.0:3000',
      pid: 12345,
    });
  });

  it('should parse valid UDP line', () => {
    const line = '  UDP    0.0.0.0:3000           *:*                                    11111';
    const result = parseNetstatLine(line, 3000);

    expect(result).toEqual({
      protocol: 'UDP',
      localAddress: '0.0.0.0:3000',
      pid: 11111,
    });
  });

  it('should handle IPv6 addresses with brackets', () => {
    const line = '  TCP    [::]:3000              [::]:0                 LISTENING       67890';
    const result = parseNetstatLine(line, 3000);

    expect(result).toEqual({
      protocol: 'TCP',
      localAddress: '[::]:3000',
      pid: 67890,
    });
  });

  it('should handle IPv6 localhost', () => {
    const line = '  TCP    [::1]:3000             [::]:0                 LISTENING       12345';
    const result = parseNetstatLine(line, 3000);

    expect(result).toEqual({
      protocol: 'TCP',
      localAddress: '[::1]:3000',
      pid: 12345,
    });
  });

  it('should handle IPv6 with zone ID', () => {
    const line = '  TCP    [fe80::1%12]:3000      [::]:0                 LISTENING       67890';
    const result = parseNetstatLine(line, 3000);

    expect(result).toEqual({
      protocol: 'TCP',
      localAddress: '[fe80::1%12]:3000',
      pid: 67890,
    });
  });

  it('should return null for wrong port', () => {
    const line = '  TCP    0.0.0.0:8080           0.0.0.0:0              LISTENING       99999';
    const result = parseNetstatLine(line, 3000);

    expect(result).toBeNull();
  });

  it('should return null for empty line', () => {
    expect(parseNetstatLine('', 3000)).toBeNull();
    expect(parseNetstatLine('   ', 3000)).toBeNull();
  });

  it('should return null for malformed line with too few parts', () => {
    expect(parseNetstatLine('TCP invalid line', 3000)).toBeNull();
    expect(parseNetstatLine('garbage data', 3000)).toBeNull();
  });

  it('should return null for invalid protocol', () => {
    const line = '  XYZ    0.0.0.0:3000           0.0.0.0:0              LISTENING       12345';
    expect(parseNetstatLine(line, 3000)).toBeNull();
  });

  it('should return null for PID of 0 (TIME_WAIT state)', () => {
    const line = '  TCP    192.168.1.100:3000     52.5.6.7:443           TIME_WAIT       0';
    expect(parseNetstatLine(line, 3000)).toBeNull();
  });

  it('should return null for negative PID', () => {
    const line = '  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       -1';
    expect(parseNetstatLine(line, 3000)).toBeNull();
  });

  it('should return null for non-numeric PID', () => {
    const line = '  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       abc';
    expect(parseNetstatLine(line, 3000)).toBeNull();
  });

  it('should handle lowercase protocol and convert to uppercase', () => {
    const line = '  tcp    0.0.0.0:3000           0.0.0.0:0              LISTENING       12345';
    const result = parseNetstatLine(line, 3000);

    expect(result?.protocol).toBe('TCP');
  });
});

describe('parseLsofLine', () => {
  it('should parse valid TCP line', () => {
    const line = 'node    12345 walter   23u  IPv4  12345      0t0  TCP *:3000 (LISTEN)';
    const result = parseLsofLine(line);

    expect(result).toEqual({
      name: 'node',
      pid: 12345,
      protocol: 'TCP',
      localAddress: '*:3000',
    });
  });

  it('should parse valid UDP line', () => {
    const line = 'node    12345 walter   23u  IPv4  12345      0t0  UDP *:3000';
    const result = parseLsofLine(line);

    expect(result).toEqual({
      name: 'node',
      pid: 12345,
      protocol: 'UDP',
      localAddress: '*:3000',
    });
  });

  it('should return null for line with too few parts', () => {
    expect(parseLsofLine('COMMAND   PID')).toBeNull();
    expect(parseLsofLine('partial line')).toBeNull();
  });

  it('should return null for invalid PID', () => {
    const line = 'node    abc walter   23u  IPv4  12345      0t0  TCP *:3000 (LISTEN)';
    expect(parseLsofLine(line)).toBeNull();
  });

  it('should return null for PID of 0', () => {
    const line = 'node    0 walter   23u  IPv4  12345      0t0  TCP *:3000 (LISTEN)';
    expect(parseLsofLine(line)).toBeNull();
  });

  it('should return null for negative PID', () => {
    const line = 'node    -1 walter   23u  IPv4  12345      0t0  TCP *:3000 (LISTEN)';
    expect(parseLsofLine(line)).toBeNull();
  });

  it('should handle established connections', () => {
    const line = 'node    12345 walter   23u  IPv4  12345      0t0  TCP 127.0.0.1:3000->127.0.0.1:45678 (ESTABLISHED)';
    const result = parseLsofLine(line);

    expect(result).toEqual({
      name: 'node',
      pid: 12345,
      protocol: 'TCP',
      localAddress: '127.0.0.1:3000->127.0.0.1:45678',
    });
  });
});

describe('parsing integration with fixtures', () => {
  describe('Windows netstat fixtures', () => {
    it('should parse NETSTAT_SINGLE_PROCESS', () => {
      const lines = NETSTAT_SINGLE_PROCESS.trim().split('\n').filter(l => l.trim());
      const results = lines.map(l => parseNetstatLine(l, 3000)).filter(Boolean);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ pid: 12345, protocol: 'TCP' });
    });

    it('should parse NETSTAT_MULTIPLE_PROCESSES with deduplication', () => {
      const lines = NETSTAT_MULTIPLE_PROCESSES.trim().split('\n').filter(l => l.trim());
      const pidSet = new Set<number>();
      const results: Array<{ pid: number; protocol: string; localAddress: string }> = [];

      for (const line of lines) {
        const parsed = parseNetstatLine(line, 3000);
        if (parsed && !pidSet.has(parsed.pid)) {
          pidSet.add(parsed.pid);
          results.push(parsed);
        }
      }

      // Should have 3 unique PIDs: 12345, 67890, 11111
      expect(results).toHaveLength(3);
      expect(results.map(r => r.pid).sort()).toEqual([11111, 12345, 67890]);
    });

    it('should handle NETSTAT_MALFORMED gracefully', () => {
      const lines = NETSTAT_MALFORMED.trim().split('\n').filter(l => l.trim());
      const results = lines.map(l => parseNetstatLine(l, 3000)).filter(Boolean);

      // Should only parse the valid line
      expect(results).toHaveLength(1);
      expect(results[0]?.pid).toBe(12345);
    });

    it('should parse NETSTAT_IPV6', () => {
      const lines = NETSTAT_IPV6.trim().split('\n').filter(l => l.trim());
      const results = lines.map(l => parseNetstatLine(l, 3000)).filter(Boolean);

      expect(results).toHaveLength(2);
    });

    it('should filter TIME_WAIT with PID 0', () => {
      const lines = NETSTAT_TIME_WAIT.trim().split('\n').filter(l => l.trim());
      const results = lines.map(l => parseNetstatLine(l, 3000)).filter(Boolean);

      // Should only include the LISTENING process with PID 12345
      expect(results).toHaveLength(1);
      expect(results[0]?.pid).toBe(12345);
    });
  });

  describe('Unix lsof fixtures', () => {
    it('should parse LSOF_SINGLE_PROCESS', () => {
      const lines = LSOF_SINGLE_PROCESS.trim().split('\n').slice(1); // Skip header
      const results = lines.map(l => parseLsofLine(l)).filter(Boolean);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ name: 'node', pid: 12345 });
    });

    it('should parse LSOF_MULTIPLE_PROCESSES with deduplication', () => {
      const lines = LSOF_MULTIPLE_PROCESSES.trim().split('\n').slice(1);
      const pidSet = new Set<number>();
      const results: Array<{ name: string; pid: number; protocol: string; localAddress: string }> = [];

      for (const line of lines) {
        const parsed = parseLsofLine(line);
        if (parsed && !pidSet.has(parsed.pid)) {
          pidSet.add(parsed.pid);
          results.push(parsed);
        }
      }

      // Should have 2 unique PIDs: 12345 (node appears twice), 67890 (nginx)
      expect(results).toHaveLength(2);
    });

    it('should handle LSOF_MALFORMED gracefully', () => {
      const lines = LSOF_MALFORMED.trim().split('\n');
      const results = lines.map(l => parseLsofLine(l)).filter(Boolean);

      // Should only parse valid lines
      expect(results).toHaveLength(1);
      expect(results[0]?.name).toBe('node');
    });

    it('should detect UDP protocol', () => {
      const lines = LSOF_UDP.trim().split('\n').slice(1);
      const results = lines.map(l => parseLsofLine(l)).filter(Boolean);

      expect(results).toHaveLength(1);
      expect(results[0]?.protocol).toBe('UDP');
    });
  });
});
