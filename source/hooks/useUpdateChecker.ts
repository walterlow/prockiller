import { useState, useEffect } from 'react';
import {
  checkForUpdate,
  performUpdate,
  getCurrentVersion,
} from '../utils/version.js';

export type UpdateStatus = 'checking' | 'updating' | 'done';

export interface UpdateResult {
  status: UpdateStatus;
  success: boolean;
  message: string | null;
}

export function useUpdateChecker(): UpdateResult {
  const [result, setResult] = useState<UpdateResult>({
    status: 'checking',
    success: true,
    message: null,
  });

  // Check and auto-update on mount
  useEffect(() => {
    let mounted = true;

    const doAutoUpdate = async () => {
      try {
        const info = await checkForUpdate();

        if (info.updateAvailable && mounted) {
          setResult({ status: 'updating', success: true, message: null });

          const updateResult = await performUpdate();
          if (mounted) {
            setResult({
              status: 'done',
              success: updateResult.success,
              message: updateResult.success
                ? `Updated to v${info.latestVersion}`
                : `Update available (v${info.latestVersion}). ${updateResult.message}`,
            });
          }
        } else if (mounted) {
          setResult({ status: 'done', success: true, message: null });
        }
      } catch {
        // Silently fail on network errors - don't disrupt the user
        if (mounted) {
          setResult({ status: 'done', success: true, message: null });
        }
      }
    };

    doAutoUpdate();

    return () => {
      mounted = false;
    };
  }, []);

  return result;
}
