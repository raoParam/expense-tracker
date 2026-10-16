import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { checkAndFetchUpdate, reloadAppAsync } from '../services/update-service';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';

export function UpdateNotification() {
  const [downloading, setDownloading] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Non-blocking background update check on app launch
    checkAndFetchUpdate({
      onDownloading: () => setDownloading(true),
      onUpdateReady: () => {
        setDownloading(false);
        setUpdateReady(true);
      },
      onError: () => {
        setDownloading(false);
      },
    });
  }, []);

  if (dismissed) {
    return null;
  }

  if (downloading) {
    return (
      <View style={styles.downloadingContainer}>
        <ActivityIndicator size="small" color="#FFFFFF" style={styles.spinner} />
        <Text style={styles.downloadingText}>Downloading update in background...</Text>
      </View>
    );
  }

  if (updateReady) {
    return (
      <View style={styles.readyContainer}>
        <Text style={styles.readyText} numberOfLines={2}>
          Update ready! Restart to apply latest changes.
        </Text>
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.restartBtn}
            onPress={() => reloadAppAsync()}
            activeOpacity={0.8}
          >
            <Text style={styles.restartText}>Restart Now</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.dismissBtn}
            onPress={() => setDismissed(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.dismissText}>Later</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  downloadingContainer: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  spinner: {
    marginRight: spacing.xs,
  },
  downloadingText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  readyContainer: {
    backgroundColor: '#0F172A',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  readyText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
    marginRight: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  restartBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: 4,
  },
  restartText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  dismissBtn: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 5,
  },
  dismissText: {
    color: '#94A3B8',
    fontSize: 12,
  },
});
