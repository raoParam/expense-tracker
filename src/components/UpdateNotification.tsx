import { createThemedStyles } from '../theme/themed-styles';
import React, { useEffect, useReducer, useRef } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  checkAndFetchUpdate,
  fetchUpdateAsyncSafe,
  getUpdateDisplayReleaseInfo,
  reloadAppAsync,
  ReleaseNoteItem,
  UpdateManifest,
  updateModalReducer,
  initialUpdateModalState,
} from '../services/update-service';
import {
  abandonStagedUpdateInstallation,
  stageUpdateInstallation,
} from '../services/update-release-notes';
import { Button } from './Button';
import { colors } from '../theme/colors';
import { spacing, radii } from '../theme/spacing';
import { typography } from '../theme/typography';
import * as Notifications from 'expo-notifications';
import { NotificationService } from '../services/notification-service';

function formatPublishedAt(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return `Published ${date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`;
}

export function UpdateNotification() {
  const [state, dispatch] = useReducer(updateModalReducer, initialUpdateModalState);
  const insets = useSafeAreaInsets();
  const installRequestedRef = useRef(false);
  const isReloadingRef = useRef(false);
  const isFetchingRef = useRef(false);
  const latestManifestRef = useRef<UpdateManifest | null>(null);
  const latestNoteItemsRef = useRef<ReleaseNoteItem[]>([]);

  const reloadDownloadedUpdate = React.useCallback(async (
    manifestOverride?: UpdateManifest | null,
    noteItemsOverride?: ReleaseNoteItem[]
  ) => {
    if (isReloadingRef.current) return;
    isReloadingRef.current = true;
    await stageUpdateInstallation(
      manifestOverride || latestManifestRef.current,
      noteItemsOverride || latestNoteItemsRef.current
    );
    const reloaded = await reloadAppAsync();
    if (!reloaded) {
      await abandonStagedUpdateInstallation();
      isReloadingRef.current = false;
      installRequestedRef.current = false;
      dispatch({ type: 'UPDATE_ERROR', error: new Error('Could not apply the downloaded update.') });
    }
  }, []);

  useEffect(() => {
    // This check is deliberately non-blocking. A downloaded update is never
    // applied unless the user explicitly chooses Update now.
    checkAndFetchUpdate({
      onChecking: () => dispatch({ type: 'CHECKING' }),
      onUpdateAvailable: async (manifest) => {
        latestManifestRef.current = manifest;
        const displayInfo = await getUpdateDisplayReleaseInfo(manifest);
        latestNoteItemsRef.current = displayInfo.releaseNoteItems;
        dispatch({ type: 'UPDATE_AVAILABLE', manifest, displayInfo });
      },
      onDownloading: () => dispatch({ type: 'DOWNLOADING' }),
      onUpdateReady: async (manifest) => {
        const readyManifest = manifest || latestManifestRef.current;
        latestManifestRef.current = readyManifest;
        const displayInfo = await getUpdateDisplayReleaseInfo(readyManifest);
        latestNoteItemsRef.current = displayInfo.releaseNoteItems;
        dispatch({ type: 'UPDATE_READY', manifest: readyManifest || undefined, displayInfo });
        const updateId = readyManifest?.id || readyManifest?.updateId;
        if (updateId) {
          void NotificationService.notifyUpdateAvailable(
            updateId,
            displayInfo.notes,
            displayInfo.title
          );
        }
        if (installRequestedRef.current) {
          void reloadDownloadedUpdate(readyManifest, displayInfo.releaseNoteItems);
        }
      },
      onError: (error) => {
        installRequestedRef.current = false;
        dispatch({ type: 'UPDATE_ERROR', error });
      },
    });
  }, [reloadDownloadedUpdate]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener?.((response) => {
      const data = response?.notification?.request?.content?.data;
      if (data?.type === 'APP_UPDATE') {
        dispatch({ type: 'SHOW_UPDATE_MODAL' });
      }
    });
    return () => {
      sub?.remove();
    };
  }, []);

  const handleUpdateNow = async () => {
    if (isReloadingRef.current) return;

    if (state.status === 'ready') {
      installRequestedRef.current = true;
      dispatch({ type: 'USER_PRESS_UPDATE_NOW' });
      await reloadDownloadedUpdate(state.manifest, state.releaseNoteItems);
      return;
    }

    if (state.status === 'error') {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      installRequestedRef.current = true;
      dispatch({ type: 'RETRY' });
      try {
        await fetchUpdateAsyncSafe({
          onDownloading: () => dispatch({ type: 'DOWNLOADING' }),
          onUpdateReady: async (manifest) => {
            const readyManifest = manifest || latestManifestRef.current || state.manifest;
            latestManifestRef.current = readyManifest;
            const displayInfo = await getUpdateDisplayReleaseInfo(readyManifest);
            latestNoteItemsRef.current = displayInfo.releaseNoteItems;
            dispatch({ type: 'UPDATE_READY', manifest: readyManifest || undefined, displayInfo });
        const updateId = readyManifest?.id || readyManifest?.updateId;
        if (updateId) {
          void NotificationService.notifyUpdateAvailable(
            updateId,
            displayInfo.notes,
            displayInfo.title
          );
        }
            void reloadDownloadedUpdate(readyManifest, displayInfo.releaseNoteItems);
          },
          onError: (error) => {
            installRequestedRef.current = false;
            dispatch({ type: 'UPDATE_ERROR', error });
          },
        });
      } finally {
        isFetchingRef.current = false;
      }
      return;
    }

    // The initial check downloads in the background. This marks the user's
    // explicit choice so a reload can happen as soon as that download is ready.
    installRequestedRef.current = true;
    dispatch({ type: 'USER_PRESS_UPDATE_NOW' });
  };

  const handleLater = () => {
    if (state.status === 'updating' || isReloadingRef.current) return;
    installRequestedRef.current = false;
    dispatch({ type: 'USER_PRESS_LATER' });
  };

  if (!state.visible || state.dismissed) return null;

  return (
    <UpdateDialog
      state={state}
      insets={insets}
      onUpdateNow={handleUpdateNow}
      onLater={handleLater}
    />
  );
}

interface UpdateDialogProps {
  state: ReturnType<typeof updateModalReducer>;
  insets: ReturnType<typeof useSafeAreaInsets>;
  onUpdateNow: () => void;
  onLater: () => void;
}

function UpdateDialog({ state, insets, onUpdateNow, onLater }: UpdateDialogProps) {
  const isDownloading = state.status === 'downloading' || state.status === 'updating';
  const isUpdating = state.status === 'updating';
  const publishedAt = formatPublishedAt(state.publishedAt);

  return (
    <Modal
      visible={state.visible}
      transparent
      animationType="fade"
      onRequestClose={onLater}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onLater}>
        <View
          style={[
            styles.backdrop,
            {
              paddingTop: Math.max(insets.top, spacing.xl),
              paddingBottom: Math.max(insets.bottom, spacing.xl),
              paddingLeft: Math.max(insets.left, spacing.lg),
              paddingRight: Math.max(insets.right, spacing.lg),
            },
          ]}
        >
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={styles.card} accessibilityViewIsModal>
              <UpdateDetails
                state={state}
                isDownloading={isDownloading}
                isUpdating={isUpdating}
                publishedAt={publishedAt}
              />
              <UpdateActions
                hasError={Boolean(state.errorMessage)}
                isUpdating={isUpdating}
                onUpdateNow={onUpdateNow}
                onLater={onLater}
              />
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

interface UpdateDetailsProps {
  state: UpdateDialogProps['state'];
  isDownloading: boolean;
  isUpdating: boolean;
  publishedAt?: string;
}

function UpdateDetails({ state, isDownloading, isUpdating, publishedAt }: UpdateDetailsProps) {
  return (
    <ScrollView
      style={styles.scrollArea}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.iconCircle} accessible accessibilityLabel="Software update">
        <Ionicons name="cloud-download-outline" size={24} color={colors.primary} />
      </View>

      <Text accessibilityRole="header" style={styles.title}>
        {state.releaseTitle || 'Update available'}
      </Text>
      <Text style={styles.description}>
        {state.status === 'ready'
          ? 'This compatible Spendly update is downloaded and ready to install.'
          : 'A compatible Spendly update is available for this app.'}
      </Text>

      {state.releaseVersion || publishedAt ? (
        <View style={styles.releaseMeta}>
          {state.releaseVersion ? (
            <Text style={styles.releaseMetaText}>Version {state.releaseVersion}</Text>
          ) : null}
          {publishedAt ? <Text style={styles.releaseMetaText}>{publishedAt}</Text> : null}
        </View>
      ) : null}

      <View style={styles.whatsNewBox}>
        <Text style={styles.whatsNewHeader}>
          {state.releaseNotesAreGeneral ? 'General summary' : "What's new"}
        </Text>
        <View style={styles.notesList}>
          {state.releaseNoteItems.length > 0 ? state.releaseNoteItems.map((item) => (
            <View key={item.id} style={styles.noteRow}>
              <Text style={styles.bullet} accessibilityElementsHidden>
                •
              </Text>
              <View style={styles.noteCopy}>
                <Text style={styles.noteTitle}>{item.title}</Text>
                <Text style={styles.noteText}>{item.description}</Text>
              </View>
            </View>
          )) : (
            <Text style={styles.noteText}>No new release notes for this installed build.</Text>
          )}
        </View>
      </View>

      {state.errorMessage ? (
        <View style={styles.errorBox} accessibilityRole="alert">
          <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
          <Text style={styles.errorText}>
            Could not download the update. Check your connection and try again.
          </Text>
        </View>
      ) : null}

      {isDownloading && !state.errorMessage ? (
        <View style={styles.downloadingBanner}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.downloadingBannerText}>
            {isUpdating ? 'Downloading update...' : 'Downloading update in background...'}
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

interface UpdateActionsProps {
  hasError: boolean;
  isUpdating: boolean;
  onUpdateNow: () => void;
  onLater: () => void;
}

function UpdateActions({ hasError, isUpdating, onUpdateNow, onLater }: UpdateActionsProps) {
  return (
    <View style={styles.buttonRow}>
      <Button
        title="Later"
        variant="outline"
        onPress={onLater}
        disabled={isUpdating}
        accessibilityLabel="Install update later"
        accessibilityHint="Dismisses this update prompt for the current app session"
        style={styles.button}
      />
      <Button
        title={isUpdating ? 'Downloading...' : hasError ? 'Retry update' : 'Update now'}
        variant="primary"
        onPress={onUpdateNow}
        loading={isUpdating}
        disabled={isUpdating}
        accessibilityLabel={hasError ? 'Retry update' : 'Update now'}
        accessibilityHint="Downloads or installs the Spendly update"
        style={styles.button}
      />
    </View>
  );
}

const styles = createThemedStyles(() => ({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '85%',
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
  },
  scrollArea: {
    flexShrink: 1,
  },
  scrollContent: {
    alignItems: 'center',
    paddingBottom: spacing.sm,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: radii.full,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  description: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  releaseMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  releaseMetaText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  whatsNewBox: {
    width: '100%',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  whatsNewHeader: {
    ...typography.sectionTitle,
    textTransform: 'none',
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  notesList: {
    gap: spacing.sm,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  bullet: {
    ...typography.bodySmall,
    color: colors.primary,
    lineHeight: 18,
  },
  noteText: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    flex: 1,
    lineHeight: 18,
  },
  noteCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  noteTitle: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  errorBox: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dangerLight,
    borderRadius: radii.md,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  errorText: {
    ...typography.caption,
    color: colors.dangerText,
    flex: 1,
  },
  downloadingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  downloadingBannerText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  button: {
    flex: 1,
  },
}));
