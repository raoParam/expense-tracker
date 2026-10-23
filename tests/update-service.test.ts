import * as Updates from 'expo-updates';
import {
  checkAndFetchUpdate,
  fetchUpdateAsyncSafe,
  reloadAppAsync,
  getCurrentUpdateInfo,
  getUpdateReleaseInfo,
  extractReleaseNotes,
  DEFAULT_RELEASE_NOTES,
  GENERAL_RELEASE_NOTES,
  KNOWN_RELEASE_NOTES_BY_UPDATE_ID,
  updateModalReducer,
  initialUpdateModalState,
} from '../src/services/update-service';

let mockIsEnabled = true;

jest.mock('expo-updates', () => ({
  get isEnabled() {
    return mockIsEnabled;
  },
  channel: 'preview',
  runtimeVersion: '1.0.0',
  updateId: 'update-1234',
  createdAt: new Date('2026-10-16T12:00:00Z'),
  isEmbeddedLaunch: false,
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
  reloadAsync: jest.fn(),
}));

describe('update-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsEnabled = true;
  });

  test('skips checking when expo-updates is disabled', async () => {
    mockIsEnabled = false;

    const onChecking = jest.fn();
    const result = await checkAndFetchUpdate({ onChecking });

    expect(result).toBe(false);
    expect(onChecking).not.toHaveBeenCalled();
    expect(Updates.checkForUpdateAsync).not.toHaveBeenCalled();
  });

  test('checks and fetches update when update is available', async () => {
    (Updates.checkForUpdateAsync as jest.Mock).mockResolvedValueOnce({
      isAvailable: true,
      manifest: { id: 'new-update-5678' },
    });
    (Updates.fetchUpdateAsync as jest.Mock).mockResolvedValueOnce({
      isNew: true,
    });

    const onChecking = jest.fn();
    const onDownloading = jest.fn();
    const onUpdateReady = jest.fn();

    const result = await checkAndFetchUpdate({
      onChecking,
      onDownloading,
      onUpdateReady,
    });

    expect(result).toBe(true);
    expect(onChecking).toHaveBeenCalled();
    expect(onDownloading).toHaveBeenCalled();
    expect(Updates.fetchUpdateAsync).toHaveBeenCalled();
    expect(onUpdateReady).toHaveBeenCalled();
  });

  test('does not fetch when no update is available', async () => {
    (Updates.checkForUpdateAsync as jest.Mock).mockResolvedValueOnce({
      isAvailable: false,
    });

    const onDownloading = jest.fn();
    const onUpdateReady = jest.fn();

    const result = await checkAndFetchUpdate({
      onDownloading,
      onUpdateReady,
    });

    expect(result).toBe(false);
    expect(onDownloading).not.toHaveBeenCalled();
    expect(Updates.fetchUpdateAsync).not.toHaveBeenCalled();
    expect(onUpdateReady).not.toHaveBeenCalled();
  });

  test('handles network/offline failure gracefully without throwing', async () => {
    const error = new Error('Network request failed');
    (Updates.checkForUpdateAsync as jest.Mock).mockRejectedValueOnce(error);

    const onError = jest.fn();
    const onUpdateReady = jest.fn();

    const result = await checkAndFetchUpdate({
      onError,
      onUpdateReady,
    });

    expect(result).toBe(false);
    expect(onError).toHaveBeenCalledWith(error);
    expect(onUpdateReady).not.toHaveBeenCalled();
  });

  test('reloadAppAsync calls Updates.reloadAsync when enabled', async () => {
    await reloadAppAsync();
    expect(Updates.reloadAsync).toHaveBeenCalled();
  });

  test('reloadAppAsync skips reload when disabled', async () => {
    mockIsEnabled = false;
    await reloadAppAsync();
    expect(Updates.reloadAsync).not.toHaveBeenCalled();
  });

  test('checks and fetches update with onUpdateAvailable callback', async () => {
    const mockManifest = { id: 'new-update-5678', metadata: { message: 'New test update' } };
    (Updates.checkForUpdateAsync as jest.Mock).mockResolvedValueOnce({
      isAvailable: true,
      manifest: mockManifest,
    });
    (Updates.fetchUpdateAsync as jest.Mock).mockResolvedValueOnce({
      isNew: true,
    });

    const onChecking = jest.fn();
    const onUpdateAvailable = jest.fn();
    const onDownloading = jest.fn();
    const onUpdateReady = jest.fn();

    const result = await checkAndFetchUpdate({
      onChecking,
      onUpdateAvailable,
      onDownloading,
      onUpdateReady,
    });

    expect(result).toBe(true);
    expect(onChecking).toHaveBeenCalled();
    expect(onUpdateAvailable).toHaveBeenCalledWith(mockManifest);
    expect(onDownloading).toHaveBeenCalled();
    expect(Updates.fetchUpdateAsync).toHaveBeenCalled();
    expect(onUpdateReady).toHaveBeenCalledWith(mockManifest);
  });

  test('fetchUpdateAsyncSafe fetches update successfully', async () => {
    (Updates.fetchUpdateAsync as jest.Mock).mockResolvedValueOnce({ isNew: true });
    const onDownloading = jest.fn();
    const onUpdateReady = jest.fn();

    const result = await fetchUpdateAsyncSafe({ onDownloading, onUpdateReady });
    expect(result).toBe(true);
    expect(onDownloading).toHaveBeenCalled();
    expect(onUpdateReady).toHaveBeenCalled();
  });

  test('fetchUpdateAsyncSafe handles failure gracefully', async () => {
    const err = new Error('Retry failed');
    (Updates.fetchUpdateAsync as jest.Mock).mockRejectedValueOnce(err);
    const onError = jest.fn();

    const result = await fetchUpdateAsyncSafe({ onError });
    expect(result).toBe(false);
    expect(onError).toHaveBeenCalledWith(err);
  });

  describe('extractReleaseNotes', () => {
    test('uses a clearly neutral general summary when metadata is absent', () => {
      expect(GENERAL_RELEASE_NOTES).toEqual(['Bug fixes and improvements']);
      expect(DEFAULT_RELEASE_NOTES).toEqual(GENERAL_RELEASE_NOTES);
      expect(getUpdateReleaseInfo({ id: 'metadata-less-update' })).toEqual(
        expect.objectContaining({
          notes: GENERAL_RELEASE_NOTES,
          isGeneralSummary: true,
          title: undefined,
          version: undefined,
          publishedAt: undefined,
        })
      );
    });

    test('returns DEFAULT_RELEASE_NOTES when manifest is null or undefined', () => {
      expect(extractReleaseNotes(null)).toEqual(DEFAULT_RELEASE_NOTES);
      expect(extractReleaseNotes(undefined)).toEqual(DEFAULT_RELEASE_NOTES);
    });

    test('resolves release notes from KNOWN_RELEASE_NOTES_BY_UPDATE_ID lookup table', () => {
      KNOWN_RELEASE_NOTES_BY_UPDATE_ID['test-update-999'] = ['Custom note for update 999'];
      try {
        expect(extractReleaseNotes({ id: 'test-update-999' })).toEqual([
          'Custom note for update 999',
        ]);
        expect(extractReleaseNotes({ updateId: 'test-update-999' })).toEqual([
          'Custom note for update 999',
        ]);
      } finally {
        delete KNOWN_RELEASE_NOTES_BY_UPDATE_ID['test-update-999'];
      }
    });

    test('extracts array release notes from manifest extra', () => {
      const notes = ['Note 1', 'Note 2'];
      const manifest = { extra: { releaseNotes: notes } };
      expect(extractReleaseNotes(manifest)).toEqual(notes);
    });

    test('extracts release title, version, notes, and valid publication date', () => {
      const info = getUpdateReleaseInfo({
        id: 'release-123',
        createdAt: '2026-10-20T10:30:00.000Z',
        metadata: {
          releaseTitle: 'Keyboard-safe forms',
          releaseVersion: '1.0.0-preview.4',
          releaseNotes: ['- Forms scroll above the Android keyboard', 'Safer update prompts'],
        },
      });

      expect(info).toEqual({
        title: 'Keyboard-safe forms',
        version: '1.0.0-preview.4',
        publishedAt: '2026-10-20T10:30:00.000Z',
        notes: ['Forms scroll above the Android keyboard', 'Safer update prompts'],
        isGeneralSummary: false,
      });
    });

    test('does not expose an invalid publication date or fabricated metadata', () => {
      const info = getUpdateReleaseInfo({
        id: 'invalid-metadata-update',
        createdAt: 'not-a-date',
        metadata: { releaseTitle: '', releaseVersion: '' },
      });

      expect(info.title).toBeUndefined();
      expect(info.version).toBeUndefined();
      expect(info.publishedAt).toBeUndefined();
      expect(info.isGeneralSummary).toBe(true);
    });

    test('extracts multiline release notes from manifest extra string', () => {
      const manifest = {
        metadata: {
          releaseNotes: '- First fix\n- Second fix',
        },
      };
      expect(extractReleaseNotes(manifest)).toEqual(['First fix', 'Second fix']);
    });

    test('extracts notes from message when releaseNotes is not present', () => {
      const manifest = {
        metadata: {
          message: '• Bug fixes\n• UI performance improvements',
        },
      };
      expect(extractReleaseNotes(manifest)).toEqual([
        'Bug fixes',
        'UI performance improvements',
      ]);
    });

    test('falls back to DEFAULT_RELEASE_NOTES when message is empty', () => {
      const manifest = { metadata: { message: '' } };
      expect(extractReleaseNotes(manifest)).toEqual(DEFAULT_RELEASE_NOTES);
    });
  });

  describe('updateModalReducer', () => {
    test('initial state has modal hidden', () => {
      expect(initialUpdateModalState.visible).toBe(false);
      expect(initialUpdateModalState.status).toBe('idle');
      expect(initialUpdateModalState.dismissed).toBe(false);
    });

    test('UPDATE_AVAILABLE sets visible and extracts release notes', () => {
      const manifest = { metadata: { message: 'Custom change' } };
      const next = updateModalReducer(initialUpdateModalState, {
        type: 'UPDATE_AVAILABLE',
        manifest,
      });

      expect(next.visible).toBe(true);
      expect(next.status).toBe('available');
      expect(next.releaseNotes).toEqual(['Custom change']);
    });

    test('DOWNLOADING keeps modal visible and updates status', () => {
      const state = updateModalReducer(initialUpdateModalState, {
        type: 'UPDATE_AVAILABLE',
        manifest: null,
      });
      const downloading = updateModalReducer(state, { type: 'DOWNLOADING' });

      expect(downloading.visible).toBe(true);
      expect(downloading.status).toBe('downloading');
    });

    test('UPDATE_READY transitions to ready state', () => {
      const state = updateModalReducer(initialUpdateModalState, {
        type: 'DOWNLOADING',
      });
      const ready = updateModalReducer(state, {
        type: 'UPDATE_READY',
      });

      expect(ready.visible).toBe(true);
      expect(ready.status).toBe('ready');
    });

    test('a deferred update remains hidden after background download completes', () => {
      const available = updateModalReducer(initialUpdateModalState, {
        type: 'UPDATE_AVAILABLE',
        manifest: { id: 'deferred-update' },
      });
      const downloading = updateModalReducer(available, { type: 'DOWNLOADING' });
      const deferred = updateModalReducer(downloading, { type: 'USER_PRESS_LATER' });
      const ready = updateModalReducer(deferred, {
        type: 'UPDATE_READY',
        manifest: { id: 'deferred-update' },
      });

      expect(deferred.dismissed).toBe(true);
      expect(ready.status).toBe('ready');
      expect(ready.visible).toBe(false);
    });

    test('USER_PRESS_LATER dismisses modal and prevents subsequent display', () => {
      const available = updateModalReducer(initialUpdateModalState, {
        type: 'UPDATE_AVAILABLE',
        manifest: null,
      });
      expect(available.visible).toBe(true);

      const dismissed = updateModalReducer(available, { type: 'USER_PRESS_LATER' });
      expect(dismissed.visible).toBe(false);
      expect(dismissed.dismissed).toBe(true);

      // Subsequent background events must not reopen the modal in this session
      const readyLater = updateModalReducer(dismissed, { type: 'UPDATE_READY' });
      expect(readyLater.visible).toBe(false);
      expect(readyLater.dismissed).toBe(true);
    });

    test('USER_PRESS_UPDATE_NOW transitions to updating when downloading', () => {
      const downloading = updateModalReducer(initialUpdateModalState, {
        type: 'DOWNLOADING',
      });
      const updating = updateModalReducer(downloading, {
        type: 'USER_PRESS_UPDATE_NOW',
      });

      expect(updating.status).toBe('updating');
    });

    test('USER_PRESS_UPDATE_NOW transitions to updating when already ready', () => {
      const ready = updateModalReducer(initialUpdateModalState, {
        type: 'UPDATE_READY',
      });
      const afterPress = updateModalReducer(ready, {
        type: 'USER_PRESS_UPDATE_NOW',
      });

      expect(afterPress.status).toBe('updating');
    });

    test('UPDATE_ERROR sets status to error and stores message', () => {
      const err = new Error('Download timed out');
      const errorState = updateModalReducer(initialUpdateModalState, {
        type: 'UPDATE_ERROR',
        error: err,
      });

      expect(errorState.status).toBe('error');
      expect(errorState.errorMessage).toBe('Download timed out');
      expect(errorState.visible).toBe(true);
    });

    test('UPDATE_ERROR can be retried without retaining the old error', () => {
      const errorState = updateModalReducer(initialUpdateModalState, {
        type: 'UPDATE_ERROR',
        error: new Error('Offline'),
      });
      const retrying = updateModalReducer(errorState, { type: 'RETRY' });

      expect(retrying.status).toBe('downloading');
      expect(retrying.visible).toBe(true);
      expect(retrying.errorMessage).toBeNull();
    });

    test('RETRY clears error and sets status to downloading', () => {
      const errorState = updateModalReducer(initialUpdateModalState, {
        type: 'UPDATE_ERROR',
        error: new Error('Failed'),
      });
      const retrying = updateModalReducer(errorState, { type: 'RETRY' });

      expect(retrying.status).toBe('downloading');
      expect(retrying.errorMessage).toBeNull();
    });
  });
});

