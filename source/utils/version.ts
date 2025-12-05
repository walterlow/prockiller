import https from 'https';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const execAsync = promisify(exec);

const PACKAGE_NAME = '@walterlow/prockiller';
const CACHE_FILE = join(tmpdir(), 'prockiller-update-check.json');
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const FETCH_TIMEOUT = 5000; // 5 seconds

export interface VersionInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  lastChecked: number;
}

export type InstallationType = 'global' | 'npx' | 'local';

interface CacheData {
  lastChecked: number;
  latestVersion: string;
}

export function getCurrentVersion(): string {
  try {
    // Try to read from package.json relative to this file
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkgPath = join(__dirname, '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export function isNewerVersion(current: string, latest: string): boolean {
  const currentParts = current.split('.').map(Number);
  const latestParts = latest.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const c = currentParts[i] || 0;
    const l = latestParts[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

function readCache(): CacheData | null {
  try {
    if (!existsSync(CACHE_FILE)) return null;
    const data = JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
    return data as CacheData;
  } catch {
    return null;
  }
}

function writeCache(data: CacheData): void {
  try {
    writeFileSync(CACHE_FILE, JSON.stringify(data));
  } catch {
    // Silently ignore cache write failures
  }
}

export function fetchLatestVersion(): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Network timeout'));
    }, FETCH_TIMEOUT);

    const req = https.get(
      `https://registry.npmjs.org/${PACKAGE_NAME}`,
      { headers: { 'Accept': 'application/json' } },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          clearTimeout(timeout);
          try {
            const json = JSON.parse(data);
            const latest = json['dist-tags']?.latest;
            if (latest) {
              resolve(latest);
            } else {
              reject(new Error('Could not find latest version'));
            }
          } catch {
            reject(new Error('Invalid response from registry'));
          }
        });
      }
    );

    req.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

export async function checkForUpdate(forceCheck = false): Promise<VersionInfo> {
  const currentVersion = getCurrentVersion();
  const now = Date.now();

  // Check cache first (unless forcing check)
  if (!forceCheck) {
    const cache = readCache();
    if (cache && (now - cache.lastChecked) < CACHE_TTL) {
      return {
        currentVersion,
        latestVersion: cache.latestVersion,
        updateAvailable: isNewerVersion(currentVersion, cache.latestVersion),
        lastChecked: cache.lastChecked,
      };
    }
  }

  try {
    const latestVersion = await fetchLatestVersion();
    const cacheData: CacheData = { lastChecked: now, latestVersion };
    writeCache(cacheData);

    return {
      currentVersion,
      latestVersion,
      updateAvailable: isNewerVersion(currentVersion, latestVersion),
      lastChecked: now,
    };
  } catch {
    // On network error, return cached version if available, otherwise current version
    const cache = readCache();
    return {
      currentVersion,
      latestVersion: cache?.latestVersion || currentVersion,
      updateAvailable: cache ? isNewerVersion(currentVersion, cache.latestVersion) : false,
      lastChecked: cache?.lastChecked || now,
    };
  }
}

export function getInstallationType(): InstallationType {
  const execPath = process.argv[1] || '';

  // npx typically runs from a cache directory
  if (execPath.includes('.npm/_npx') ||
      execPath.includes('npx') ||
      execPath.includes('_npx')) {
    return 'npx';
  }

  // Check for global install paths
  // Windows: C:\Users\...\AppData\Roaming\npm\node_modules
  // Unix: /usr/local/lib/node_modules or ~/.npm/lib/node_modules
  if (execPath.includes('node_modules') &&
      (execPath.includes('Roaming') ||
       execPath.includes('/lib/node_modules/') ||
       execPath.includes('/global/'))) {
    return 'global';
  }

  return 'local';
}

export async function performUpdate(): Promise<{ success: boolean; message: string }> {
  const installationType = getInstallationType();

  if (installationType === 'npx') {
    return {
      success: true,
      message: 'You are using npx - next run will automatically use the latest version',
    };
  }

  const isWindows = process.platform === 'win32';

  try {
    const command = `npm update -g ${PACKAGE_NAME}`;
    await execAsync(command, { timeout: 60000 });

    const newVersion = await fetchLatestVersion();
    return {
      success: true,
      message: `Successfully updated to v${newVersion}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('EACCES') || message.includes('permission') || message.includes('Access is denied')) {
      const sudoHint = isWindows
        ? 'Try running as Administrator'
        : 'Try running with sudo: sudo npm update -g @walterlow/prockiller';
      return { success: false, message: sudoHint };
    }

    return { success: false, message: `Update failed: ${message}` };
  }
}
