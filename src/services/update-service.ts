import * as Updates from 'expo-updates';

export interface UpdateCheckCallbacks {
  onChecking?: () => void;
  onDownloading?: () => void;
  onUpdateReady?: () => void;
  onError?: (error: Error) => void;
}

const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : false;

/**
 * Checks for and downloads available OTA updates safely.
 * Will not run in development mode or when Updates is disabled (e.g., in Expo Go).
 * Network failures or offline states are caught and handled gracefully so the app startup is never blocked.
 */
export async function checkAndFetchUpdate(
  callbacks: UpdateCheckCallbacks = {}
): Promise<boolean> {
  if (isDev || !Updates.isEnabled) {
    return false;
  }

  try {
    callbacks.onChecking?.();
    const update = await Updates.checkForUpdateAsync();

    if (update.isAvailable) {
      callbacks.onDownloading?.();
      await Updates.fetchUpdateAsync();
      callbacks.onUpdateReady?.();
      return true;
    }
  } catch (error: any) {
    // Non-blocking: log update check error (e.g. offline, rate limit, timeout)
    console.log('[EAS Updates] Update check or fetch skipped/failed:', error?.message || error);
    callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
  }
  return false;
}

/**
 * Safely instructs the app to reload and apply the downloaded update.
 * Prevents execution in dev mode.
 */
export async function reloadAppAsync(): Promise<void> {
  if (isDev || !Updates.isEnabled) {
    return;
  }

  try {
    await Updates.reloadAsync();
  } catch (error: any) {
    console.warn('[EAS Updates] Failed to reload application:', error?.message || error);
  }
}

/**
 * Returns diagnostic metadata about the current running update.
 */
export function getCurrentUpdateInfo() {
  return {
    isEnabled: Updates.isEnabled,
    channel: Updates.channel,
    runtimeVersion: Updates.runtimeVersion,
    updateId: Updates.updateId,
    createdAt: Updates.createdAt,
    isEmbeddedLaunch: Updates.isEmbeddedLaunch,
  };
}
