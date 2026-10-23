import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  abandonStagedUpdateInstallation,
  getDeliveredReleaseNoteIds,
  getUnreconciledReleaseNotes,
  reconcileInstalledReleaseNotes,
  stageUpdateInstallation,
} from '../src/services/update-release-notes';

const noteA = {
  id: 'expense-participation',
  title: 'Expense participation',
  description: 'See your share and acknowledgement status in room expenses.',
};
const noteB = {
  id: 'notification-actions',
  title: 'Notification actions',
  description: 'Acknowledge or reject eligible expenses from notifications.',
};

describe('version-aware release note ledger', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  test('old installed build shows all missing notes once, then reconciles after install', async () => {
    const target = { id: 'ota-2', runtimeVersion: '1.0.0', version: '1.0.0' };
    expect(await getUnreconciledReleaseNotes([noteA, noteB], target)).toHaveLength(2);

    await stageUpdateInstallation(target, [noteA, noteB]);
    await reconcileInstalledReleaseNotes(target, [noteA, noteB]);

    expect(await getUnreconciledReleaseNotes([noteA, noteB], target)).toEqual([]);
  });

  test('skipping does not deliver notes and a later OTA still includes all unreconciled history', async () => {
    const first = { id: 'ota-1', runtimeVersion: '1.0.0' };
    const second = { id: 'ota-2', runtimeVersion: '1.0.0' };
    expect(await getUnreconciledReleaseNotes([noteA], first)).toHaveLength(1);
    expect(await getUnreconciledReleaseNotes([noteA, noteB], second)).toHaveLength(2);
  });

  test('failed reload does not mark notes delivered', async () => {
    const target = { id: 'ota-failed', runtimeVersion: '1.0.0' };
    await stageUpdateInstallation(target, [noteA]);
    await abandonStagedUpdateInstallation();
    expect(await getDeliveredReleaseNoteIds()).toEqual(new Set());
    expect(await getUnreconciledReleaseNotes([noteA], target)).toHaveLength(1);
  });

  test('current bundle metadata establishes a deterministic baseline, including same-runtime OTA IDs', async () => {
    const installed = { id: 'ota-current', runtimeVersion: '1.0.0' };
    await reconcileInstalledReleaseNotes(installed, [noteA]);
    expect(await getUnreconciledReleaseNotes([noteA, noteB], installed)).toEqual([noteB]);

    await reconcileInstalledReleaseNotes({ id: 'ota-current-2', runtimeVersion: '1.0.0' }, [noteB]);
    expect(await getDeliveredReleaseNoteIds()).toEqual(new Set(['expense-participation', 'notification-actions']));
  });

  test('deduplicates repeated note IDs', async () => {
    const target = { id: 'ota-dupe', runtimeVersion: '1.0.0' };
    expect(await getUnreconciledReleaseNotes([noteA, noteA], target)).toEqual([noteA]);
  });
});
