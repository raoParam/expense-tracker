import * as Updates from 'expo-updates';
import {
  dedupeReleaseNotes,
  getUnreconciledReleaseNotes,
  normaliseReleaseNotes,
  reconcileInstalledReleaseNotes,
  ReleaseNoteItem,
} from './update-release-notes';

export type UpdateManifest = {
  id?: string;
  updateId?: string;
  createdAt?: string | number;
  runtimeVersion?: string;
  version?: string;
  metadata?: Record<string, unknown>;
  extra?: Record<string, unknown> & {
    expoClient?: Record<string, unknown> & {
      version?: string;
      extra?: Record<string, unknown>;
    };
  };
};

export type { ReleaseNoteItem } from './update-release-notes';

export interface UpdateReleaseInfo {
  title?: string;
  version?: string;
  publishedAt?: string;
  notes: string[];
  isGeneralSummary: boolean;
}

export interface UpdateDisplayReleaseInfo extends UpdateReleaseInfo {
  releaseNoteItems: ReleaseNoteItem[];
}

export interface UpdateCheckCallbacks {
  onChecking?: () => void;
  onUpdateAvailable?: (manifest: UpdateManifest) => void | Promise<void>;
  onDownloading?: () => void;
  onUpdateReady?: (manifest?: UpdateManifest) => void | Promise<void>;
  onError?: (error: Error) => void;
}

/**
 * Optional release-note overrides for updates whose metadata cannot carry
 * notes. Populate this with a real EAS update ID only after that update has
 * been published and verified. An empty table is intentional.
 */
export const KNOWN_RELEASE_NOTES_BY_UPDATE_ID: Record<string, Array<ReleaseNoteItem | string>> = {};

/** This is deliberately neutral and is labelled as a general summary in the UI. */
export const GENERAL_RELEASE_NOTES = ['Bug fixes and improvements'];
export const DEFAULT_RELEASE_NOTES = GENERAL_RELEASE_NOTES;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function getManifestMetadata(manifest?: UpdateManifest | null): Record<string, unknown> {
  return isRecord(manifest?.metadata) ? manifest.metadata : {};
}

function getExpoClientExtra(manifest?: UpdateManifest | null): Record<string, unknown> {
  const expoClient = manifest?.extra?.expoClient;
  return isRecord(expoClient?.extra) ? expoClient.extra : {};
}

function firstString(...values: unknown[]): string | undefined {
  return values.find(
    (value): value is string => typeof value === 'string' && value.trim().length > 0
  )?.trim();
}

function getUpdateId(manifest?: UpdateManifest | null): string | undefined {
  return firstString(manifest?.id, manifest?.updateId);
}

export function getReleaseNoteItems(manifest?: UpdateManifest | null): ReleaseNoteItem[] {
  const metadata = getManifestMetadata(manifest);
  const expoClientExtra = getExpoClientExtra(manifest);
  const updateId = getUpdateId(manifest);
  const mappedNotes = updateId
    ? normaliseReleaseNotes(KNOWN_RELEASE_NOTES_BY_UPDATE_ID[updateId], `update:${updateId}`)
    : [];
  const structuredMetadata =
    metadata.releaseNoteItems ?? metadata.releaseNotes ?? manifest?.extra?.releaseNotes ?? expoClientExtra.releaseNotes;
  const metadataItems = normaliseReleaseNotes(structuredMetadata, `manifest:${updateId || 'unknown'}`);
  const legacyItems = metadataItems.length > 0
    ? metadataItems
    : normaliseReleaseNotes(metadata.notes ?? metadata.message, `manifest:${updateId || 'unknown'}`);
  return dedupeReleaseNotes(mappedNotes.length > 0 ? mappedNotes : legacyItems).map((item) => ({
    ...item,
    updateId: item.updateId || updateId,
  }));
}

function getPublishedAt(manifest: UpdateManifest | null | undefined, metadata: Record<string, unknown>) {
  const rawDate = metadata.publishedAt ?? metadata.releasedAt ?? manifest?.createdAt;
  if (typeof rawDate !== 'string' && typeof rawDate !== 'number') return undefined;

  const date = new Date(rawDate);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/**
 * Resolves only release information actually present in update metadata or a
 * verified update-ID mapping. It never uses the running app's release notes.
 */
export function getUpdateReleaseInfo(manifest?: UpdateManifest | null): UpdateReleaseInfo {
  const metadata = getManifestMetadata(manifest);
  const expoClientExtra = getExpoClientExtra(manifest);
  const items = getReleaseNoteItems(manifest);
  const notes = items.map((item) => item.description);

  return {
    title: firstString(
      metadata.releaseTitle,
      metadata.title,
      metadata.name,
      manifest?.extra?.releaseTitle,
      expoClientExtra.releaseTitle
    ),
    version: firstString(
      metadata.releaseVersion,
      metadata.version,
      manifest?.version,
      manifest?.extra?.releaseVersion,
      expoClientExtra.releaseVersion,
      manifest?.extra?.expoClient?.version
    ),
    publishedAt: getPublishedAt(manifest, metadata),
    notes: notes.length > 0 ? notes : DEFAULT_RELEASE_NOTES,
    isGeneralSummary: notes.length === 0,
  };
}

export async function getUpdateDisplayReleaseInfo(
  manifest?: UpdateManifest | null
): Promise<UpdateDisplayReleaseInfo> {
  const info = getUpdateReleaseInfo(manifest);
  const installedManifest = (Updates as unknown as { manifest?: UpdateManifest | null }).manifest;
  const installedAppVersion =
    installedManifest?.version ||
    (isRecord(installedManifest?.extra?.expoClient)
      ? firstString(installedManifest?.extra?.expoClient.version)
      : undefined);
  const applicabilityManifest = installedAppVersion
    ? {
        ...manifest,
        version: installedAppVersion,
        extra: {
          ...(manifest?.extra || {}),
          expoClient: {
            ...(isRecord(manifest?.extra?.expoClient) ? manifest.extra.expoClient : {}),
            version: installedAppVersion,
          },
        },
      }
    : manifest || undefined;
  const releaseNoteItems = await getUnreconciledReleaseNotes(
    getReleaseNoteItems(manifest),
    applicabilityManifest
  );
  return {
    ...info,
    notes: releaseNoteItems.length > 0 ? releaseNoteItems.map((item) => item.description) : [],
    isGeneralSummary: releaseNoteItems.length === 0,
    releaseNoteItems,
  };
}

/** Backwards-compatible helper for callers that only need the bullet list. */
export function extractReleaseNotes(manifest?: UpdateManifest | null): string[] {
  return getUpdateReleaseInfo(manifest).notes;
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
  manifest: UpdateManifest | null;
  errorMessage: string | null;
  releaseNotes: string[];
  releaseNoteItems: ReleaseNoteItem[];
  releaseNotesAreGeneral: boolean;
  releaseTitle?: string;
  releaseVersion?: string;
  publishedAt?: string;
}

export const initialUpdateModalState: UpdateModalState = {
  visible: false,
  status: 'idle',
  dismissed: false,
  manifest: null,
  errorMessage: null,
  releaseNotes: DEFAULT_RELEASE_NOTES,
  releaseNotesAreGeneral: true,
  releaseNoteItems: [],
};

export type UpdateModalAction =
  | { type: 'CHECKING' }
  | {
      type: 'UPDATE_AVAILABLE';
      manifest: UpdateManifest | null;
      displayInfo?: UpdateDisplayReleaseInfo;
    }
  | { type: 'DOWNLOADING' }
  | { type: 'UPDATE_READY'; manifest?: UpdateManifest; displayInfo?: UpdateDisplayReleaseInfo }
  | { type: 'UPDATE_ERROR'; error: Error }
  | { type: 'USER_PRESS_UPDATE_NOW' }
  | { type: 'USER_PRESS_LATER' }
  | { type: 'SHOW_UPDATE_MODAL' }
  | { type: 'RETRY' };

function applyReleaseInfo(
  state: UpdateModalState,
  manifest: UpdateManifest | null | undefined,
  displayInfo?: UpdateDisplayReleaseInfo
) {
  if (!manifest) return state;
  const release = displayInfo || getUpdateReleaseInfo(manifest);
  return {
    ...state,
    manifest,
    releaseNotes: release.notes,
    releaseNotesAreGeneral: release.isGeneralSummary,
    releaseNoteItems: displayInfo ? displayInfo.releaseNoteItems : getReleaseNoteItems(manifest),
    releaseTitle: release.title,
    releaseVersion: release.version,
    publishedAt: release.publishedAt,
  };
}

export function updateModalReducer(
  state: UpdateModalState,
  action: UpdateModalAction
): UpdateModalState {
  switch (action.type) {
    case 'CHECKING':
      return state;

    case 'UPDATE_AVAILABLE': {
      const next = applyReleaseInfo(state, action.manifest, action.displayInfo);
      return {
        ...next,
        status: state.status === 'idle' ? 'available' : state.status,
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

    case 'UPDATE_READY': {
      const next = applyReleaseInfo(state, action.manifest, action.displayInfo);
      return {
        ...next,
        status: 'ready',
        visible: !state.dismissed,
        errorMessage: null,
      };
    }

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

    case 'SHOW_UPDATE_MODAL':
      return {
        ...state,
        visible: state.status !== 'idle',
        dismissed: false,
      };

    case 'RETRY':
      return {
        ...state,
        status: 'downloading',
        errorMessage: null,
        visible: !state.dismissed,
      };

    default:
      return state;
  }
}

const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : false;

function canUseUpdates(): boolean {
  return Boolean(
    !isDev &&
      Updates &&
      Updates.isEnabled &&
      typeof Updates.checkForUpdateAsync === 'function' &&
      typeof Updates.fetchUpdateAsync === 'function'
  );
}

export async function reconcileInstalledUpdate(): Promise<void> {
  const currentManifest = (Updates as unknown as { manifest?: UpdateManifest | null }).manifest;
  await reconcileInstalledReleaseNotes(currentManifest, getReleaseNoteItems(currentManifest));
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Checks for and downloads OTA updates safely. The caller decides when to
 * reload; downloading never forces a reload by itself.
 */
export async function checkAndFetchUpdate(
  callbacks: UpdateCheckCallbacks = {}
): Promise<boolean> {
  if (!canUseUpdates()) return false;

  try {
    await reconcileInstalledUpdate();
    callbacks.onChecking?.();
    const update = await Updates.checkForUpdateAsync();

    if (update.isAvailable) {
      await callbacks.onUpdateAvailable?.(update.manifest as UpdateManifest);
      callbacks.onDownloading?.();
      const fetched = await Updates.fetchUpdateAsync();

      if (!fetched.isNew) {
        throw new Error('The update could not be downloaded.');
      }

      await callbacks.onUpdateReady?.(
        (fetched.manifest as UpdateManifest | undefined) ??
          (update.manifest as UpdateManifest)
      );
      return true;
    }
  } catch (error: unknown) {
    console.log('[EAS Updates] Update check or fetch skipped/failed:', error);
    callbacks.onError?.(toError(error));
  }
  return false;
}

/** Safely fetches an update on explicit user retry. */
export async function fetchUpdateAsyncSafe(callbacks: {
  onDownloading?: () => void;
  onUpdateReady?: (manifest?: UpdateManifest) => void | Promise<void>;
  onError?: (error: Error) => void;
} = {}): Promise<boolean> {
  if (!canUseUpdates()) return false;

  try {
    callbacks.onDownloading?.();
    const fetched = await Updates.fetchUpdateAsync();
    if (!fetched.isNew) {
      throw new Error('The update could not be downloaded.');
    }
    await callbacks.onUpdateReady?.(fetched.manifest as UpdateManifest | undefined);
    return true;
  } catch (error: unknown) {
    console.log('[EAS Updates] Retry fetch update failed:', error);
    callbacks.onError?.(toError(error));
    return false;
  }
}

/** Safely applies a downloaded update only after an explicit user action. */
export async function reloadAppAsync(): Promise<boolean> {
  if (isDev || !Updates || !Updates.isEnabled || typeof Updates.reloadAsync !== 'function') {
    return false;
  }

  try {
    await Updates.reloadAsync();
    return true;
  } catch (error: unknown) {
    console.warn('[EAS Updates] Failed to reload application:', error);
    return false;
  }
}

export function getCurrentUpdateInfo() {
  return {
    isEnabled: Boolean(Updates?.isEnabled),
    channel: Updates?.channel ?? null,
    runtimeVersion: Updates?.runtimeVersion ?? null,
    updateId: Updates?.updateId ?? null,
    createdAt: Updates?.createdAt ?? null,
    isEmbeddedLaunch: Updates?.isEmbeddedLaunch ?? null,
  };
}
