import * as Updates from 'expo-updates';
import {
  checkAndFetchUpdate,
  reloadAppAsync,
  getCurrentUpdateInfo,
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

  test('getCurrentUpdateInfo returns metadata', () => {
    const info = getCurrentUpdateInfo();
    expect(info.isEnabled).toBe(true);
    expect(info.channel).toBe('preview');
    expect(info.runtimeVersion).toBe('1.0.0');
    expect(info.updateId).toBe('update-1234');
  });
});
