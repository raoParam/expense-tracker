import * as Updates from 'expo-updates';

export interface UpdateCheckCallbacks {
  onChecking?: () => void;
  onUpdateAvailable?: (manifest: any) => void;
  onDownloading?: () => void;
  onUpdateReady?: (manifest?: any) => void;
  onError?: (error: Error) => void;
}

export const CURRENT_RELEASE_NOTES = [
  'Fixed bottom navigation accessibility for Android three-button navigation.',
  'Improved access to Home, Expenses, Rooms, and About tabs.',
  'Fixed the production backend URL so Rooms can connect to the deployed server.',
];

/**
 * Release notes mapped to known update IDs.
 * Future updates can be keyed here or embedded directly in the update's manifest metadata / message.
 */
export const KNOWN_RELEASE_NOTES_BY_UPDATE_ID: Record<string, string[]> = {};

export const DEFAULT_RELEASE_NOTES = CURRENT_RELEASE_NOTES;

/**
 * Extracts concise release notes from update manifest metadata, or falls back to
 * confirmed notes for the currently published update.
 */
export function extractReleaseNotes(manifest?: any): string[] {
  if (!manifest) {
    return DEFAULT_RELEASE_NOTES;
  }

  // 1. Check known lookup table by update ID if present
  const updateId = manifest.id || manifest.updateId;
  if (updateId && KNOWN_RELEASE_NOTES_BY_UPDATE_ID[updateId]) {
    return KNOWN_RELEASE_NOTES_BY_UPDATE_ID[updateId];
  }

  // 2. Check for releaseNotes array or string in manifest extra/metadata
  const customNotes =
    manifest.extra?.releaseNotes ||
    manifest.metadata?.releaseNotes ||
    manifest.extra?.expoClient?.extra?.releaseNotes;

  if (Array.isArray(customNotes) && customNotes.length > 0) {
    const filtered = customNotes.map(String).filter((s) => s.trim().length > 0);
    if (filtered.length > 0) return filtered;
  }
  if (typeof customNotes === 'string' && customNotes.trim().length > 0) {
    const lines = customNotes
      .split('\n')
      .map((s) => s.trim().replace(/^[-*•]\s*/, ''))
      .filter(Boolean);
    if (lines.length > 0) return lines;
  }

  // 3. Check for commit message or release note in metadata/message
  const message = manifest.metadata?.message || manifest.message;
  if (typeof message === 'string' && message.trim().length > 0) {
    const lines = message
      .split('\n')
      .map((s) => s.trim().replace(/^[-*•]\s*/, ''))
      .filter(Boolean);
    if (lines.length > 0) return lines;
  }

  // 4. Fallback to confirmed release notes for the published update
  return DEFAULT_RELEASE_NOTES;
}

export type UpdateModalStatus =
  | 'idle'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'updating'
  | 'error';

export interface UpdateModalState {
  visible: boolean;
  status: UpdateModalStatus;
  dismissed: boolean;
  manifest: any;
  errorMessage: string | null;
  releaseNotes: string[];
}

export const initialUpdateModalState: UpdateModalState = {
  visible: false,
  status: 'idle',
  dismissed: false,
  manifest: null,
  errorMessage: null,
  releaseNotes: DEFAULT_RELEASE_NOTES,
};

export type UpdateModalAction =
  | { type: 'CHECKING' }
  | { type: 'UPDATE_AVAILABLE'; manifest: any }
  | { type: 'DOWNLOADING' }
  | { type: 'UPDATE_READY'; manifest?: any }
  | { type: 'UPDATE_ERROR'; error: Error }
  | { type: 'USER_PRESS_UPDATE_NOW' }
  | { type: 'USER_PRESS_LATER' }
  | { type: 'RETRY' };

export function updateModalReducer(
  state: UpdateModalState,
  action: UpdateModalAction
): UpdateModalState {
  switch (action.type) {
    case 'CHECKING':
      return {
        ...state,
        status: state.status === 'idle' ? 'idle' : state.status,
      };

    case 'UPDATE_AVAILABLE': {
      const notes = extractReleaseNotes(action.manifest);
      return {
        ...state,
        status: state.status === 'idle' ? 'available' : state.status,
        manifest: action.manifest,
        releaseNotes: notes,
        visible: !state.dismissed,
        errorMessage: null,
      };
    }

    case 'DOWNLOADING':
      return {
        ...state,
        status: state.status === 'updating' ? 'updating' : 'downloading',
        visible: !state.dismissed,
        errorMessage: null,
      };

    case 'UPDATE_READY':
      return {
        ...state,
        status: 'ready',
        visible: !state.dismissed,
        errorMessage: null,
        manifest: action.manifest ?? state.manifest,
        releaseNotes: action.manifest
          ? extractReleaseNotes(action.manifest)
          : state.releaseNotes,
      };

    case 'UPDATE_ERROR':
      return {
        ...state,
        status: 'error',
        visible: !state.dismissed,
        errorMessage:
          action.error?.message ||
          'Could not download update. Please check your connection and try again.',
      };

    case 'USER_PRESS_UPDATE_NOW':
      return {
        ...state,
        status: 'updating',
      };

    case 'USER_PRESS_LATER':
      return {
        ...state,
        dismissed: true,
        visible: false,
      };

    case 'RETRY':
      return {
        ...state,
        status: 'downloading',
        errorMessage: null,
      };

    default:
      return state;
  }
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
      callbacks.onUpdateAvailable?.(update.manifest);
      callbacks.onDownloading?.();
      await Updates.fetchUpdateAsync();
      callbacks.onUpdateReady?.(update.manifest);
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
 * Safely fetches update on user retry.
 */
export async function fetchUpdateAsyncSafe(callbacks: {
  onDownloading?: () => void;
  onUpdateReady?: () => void;
  onError?: (error: Error) => void;
} = {}): Promise<boolean> {
  if (isDev || !Updates.isEnabled) {
    return false;
  }

  try {
    callbacks.onDownloading?.();
    await Updates.fetchUpdateAsync();
    callbacks.onUpdateReady?.();
    return true;
  } catch (error: any) {
    console.log('[EAS Updates] Retry fetch update failed:', error?.message || error);
    callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
    return false;
  }
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
