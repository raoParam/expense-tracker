import React, { useEffect, useReducer, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableWithoutFeedback,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  checkAndFetchUpdate,
  fetchUpdateAsyncSafe,
  reloadAppAsync,
  updateModalReducer,
  initialUpdateModalState,
} from '../services/update-service';
import { Button } from './Button';
import { colors } from '../theme/colors';
import { spacing, radii } from '../theme/spacing';
import { typography } from '../theme/typography';

export function UpdateNotification() {
  const [state, dispatch] = useReducer(updateModalReducer, initialUpdateModalState);
  const insets = useSafeAreaInsets();
  const isUpdatingRef = useRef(false);
  const isReloadingRef = useRef(false);
  const isFetchingRef = useRef(false);

  useEffect(() => {
    isUpdatingRef.current = state.status === 'updating';
  }, [state.status]);

  useEffect(() => {
    // Non-blocking background update check on app launch
    checkAndFetchUpdate({
      onChecking: () => dispatch({ type: 'CHECKING' }),
      onUpdateAvailable: (manifest) => dispatch({ type: 'UPDATE_AVAILABLE', manifest }),
      onDownloading: () => dispatch({ type: 'DOWNLOADING' }),
      onUpdateReady: (manifest) => {
        dispatch({ type: 'UPDATE_READY', manifest });
        if (isUpdatingRef.current && !isReloadingRef.current) {
          isReloadingRef.current = true;
          reloadAppAsync();
        }
      },
      onError: (error) => dispatch({ type: 'UPDATE_ERROR', error }),
    });
  }, []);

  const handleUpdateNow = async () => {
    if (isReloadingRef.current) {
      return;
    }

    if (state.status === 'ready') {
      isReloadingRef.current = true;
      dispatch({ type: 'USER_PRESS_UPDATE_NOW' });
      await reloadAppAsync();
    } else if (state.status === 'error') {
      if (isFetchingRef.current) {
        return;
      }
      isFetchingRef.current = true;
      dispatch({ type: 'RETRY' });
      try {
        await fetchUpdateAsyncSafe({
          onDownloading: () => dispatch({ type: 'DOWNLOADING' }),
          onUpdateReady: () => {
            dispatch({ type: 'UPDATE_READY' });
            if (!isReloadingRef.current) {
              isReloadingRef.current = true;
              reloadAppAsync();
            }
          },
          onError: (err) => dispatch({ type: 'UPDATE_ERROR', error: err }),
        });
      } finally {
        isFetchingRef.current = false;
      }
    } else {
      // Still downloading: mark as updating so it reloads as soon as download completes
      dispatch({ type: 'USER_PRESS_UPDATE_NOW' });
    }
  };

  const handleLater = () => {
    if (state.status === 'updating' || isReloadingRef.current) {
      return; // Do not dismiss if reload is in progress
    }
    dispatch({ type: 'USER_PRESS_LATER' });
  };

  if (!state.visible || state.dismissed) {
    return null;
  }

  const isDownloading = state.status === 'downloading' || state.status === 'updating';
  const isUpdating = state.status === 'updating';

  return (
    <Modal
      visible={state.visible}
      transparent
      animationType="fade"
      onRequestClose={handleLater}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={handleLater}>
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
            <View style={styles.card}>
              <ScrollView
                style={styles.scrollArea}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                bounces={false}
              >
                {/* Header Icon */}
                <View style={styles.iconCircle}>
                  <Ionicons name="cloud-download-outline" size={24} color={colors.primary} />
                </View>

                {/* Title & Description */}
                <Text style={styles.title}>A new Spendly update is ready</Text>
                <Text style={styles.description}>
                  We've improved Spendly to make managing your expenses easier.
                </Text>

                {/* What's New Box */}
                <View style={styles.whatsNewBox}>
                  <Text style={styles.whatsNewHeader}>What's new</Text>
                  <View style={styles.notesList}>
                    {state.releaseNotes.map((note, index) => (
                      <View key={index} style={styles.noteRow}>
                        <Ionicons
                          name="checkmark-circle"
                          size={16}
                          color={colors.primary}
                          style={styles.checkIcon}
                        />
                        <Text style={styles.noteText}>{note}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Error Banner if download failed */}
                {state.errorMessage ? (
                  <View style={styles.errorBox}>
                    <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
                    <Text style={styles.errorText}>
                      Could not download update. Please check your connection and try again.
                    </Text>
                  </View>
                ) : null}

                {/* Background downloading indicator */}
                {isDownloading && !isUpdating && !state.errorMessage ? (
                  <View style={styles.downloadingBanner}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.downloadingBannerText}>
                      Downloading update in background...
                    </Text>
                  </View>
                ) : null}
              </ScrollView>

              {/* Action Buttons */}
              <View style={styles.buttonRow}>
                <Button
                  title="Later"
                  variant="outline"
                  onPress={handleLater}
                  disabled={isUpdating}
                  style={styles.button}
                />
                <Button
                  title={
                    isUpdating
                      ? 'Downloading...'
                      : state.errorMessage
                      ? 'Retry'
                      : 'Update now'
                  }
                  variant="primary"
                  onPress={handleUpdateNow}
                  loading={isUpdating}
                  disabled={isUpdating}
                  style={styles.button}
                />
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    marginBottom: spacing.lg,
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
    gap: spacing.xs + 2,
  },
  checkIcon: {
    marginTop: 1,
  },
  noteText: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    flex: 1,
    lineHeight: 18,
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
});
