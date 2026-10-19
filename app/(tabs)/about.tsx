import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  Modal,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { Card } from '../../src/components/Card';
import { Button } from '../../src/components/Button';
import { ConfirmationDialog } from '../../src/components/ConfirmationDialog';
import { colors } from '../../src/theme/colors';
import { spacing, radii } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';
import { NotificationService } from '../../src/services/notification-service';
import { SQLitePersonalExpenseRepository } from '../../src/repositories/personal-expense-repository';
import { BackupService, ImportPreview } from '../../src/services/backup-service';

export default function AboutScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const db = useSQLiteContext();
  const activeUserId = user?.uid || 'guest';
  const repo = React.useMemo(() => new SQLitePersonalExpenseRepository(db, activeUserId), [db, activeUserId]);

  const [logoutDialogVisible, setLogoutDialogVisible] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean | null>(null);

  // Personal Backup & Restore State
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pasteModalVisible, setPasteModalVisible] = useState(false);
  const [pastedJson, setPastedJson] = useState('');
  const [importConfirmVisible, setImportConfirmVisible] = useState(false);
  const [pendingPreview, setPendingPreview] = useState<ImportPreview | null>(null);
  const [executingRestore, setExecutingRestore] = useState(false);

  useEffect(() => {
    const checkNotificationStatus = async () => {
      try {
        const status = await NotificationService.getPermissionStatus();
        setNotificationsEnabled(status.granted || status.status === 'granted');
      } catch {
        setNotificationsEnabled(false);
      }
    };
    checkNotificationStatus();
  }, []);

  const handleConfirmLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      setLogoutDialogVisible(false);
    } catch (err: any) {
      Alert.alert('Logout Failed', err?.message || 'Failed to sign out.');
    } finally {
      setLoggingOut(false);
    }
  };

  const handleExportBackup = async () => {
    setExporting(true);
    try {
      const res = await BackupService.exportBackup(repo);
      if (res.success) {
        Alert.alert(
          'Backup Exported',
          `Successfully exported ${res.count} personal expense(s) to ${res.filename}.`
        );
      } else if (!res.cancelled && res.error) {
        Alert.alert('Export Failed', res.error);
      }
    } catch (err: any) {
      Alert.alert('Export Error', err?.message || 'Failed to export backup.');
    } finally {
      setExporting(false);
    }
  };

  const processBackupJson = async (jsonString: string) => {
    const validation = BackupService.parseAndValidateBackup(jsonString);
    if (!validation.valid || !validation.data) {
      Alert.alert('Invalid Backup File', validation.error || 'The backup file could not be validated.');
      return;
    }

    try {
      const preview = await BackupService.previewImport(repo, validation.data);
      if (preview.totalInBackup === 0) {
        Alert.alert('Empty Backup', 'The selected backup file contains no expense records.');
        return;
      }
      setPendingPreview(preview);
      setImportConfirmVisible(true);
    } catch (err: any) {
      Alert.alert('Import Error', err?.message || 'Failed to analyze backup file.');
    }
  };

  const handleImportFromFile = async () => {
    setImporting(true);
    try {
      const res = await BackupService.importBackupFromFile();
      if (res.cancelled) {
        return;
      }
      if (res.error) {
        Alert.alert('File Selection Failed', res.error);
        return;
      }
      if (res.content) {
        await processBackupJson(res.content);
      }
    } catch (err: any) {
      Alert.alert('Import Error', err?.message || 'Failed to open backup file.');
    } finally {
      setImporting(false);
    }
  };

  const handleConfirmPaste = async () => {
    const text = pastedJson.trim();
    if (!text) {
      Alert.alert('Empty Content', 'Please paste valid backup JSON text.');
      return;
    }
    setPasteModalVisible(false);
    setPastedJson('');
    await processBackupJson(text);
  };

  const handleConfirmRestore = async () => {
    if (!pendingPreview) return;
    setExecutingRestore(true);
    try {
      const result = await BackupService.executeImport(repo, pendingPreview);
      setImportConfirmVisible(false);
      setPendingPreview(null);
      Alert.alert(
        'Restore Complete',
        `Restored ${result.importedCount} expense(s) into your personal records.${
          result.skippedDuplicatesCount > 0
            ? ` (${result.skippedDuplicatesCount} duplicate(s) already existed and were skipped.)`
            : ''
        }`
      );
    } catch (err: any) {
      Alert.alert('Restore Failed', err?.message || 'Failed to restore expenses.');
    } finally {
      setExecutingRestore(false);
    }
  };

  const getRestoreDialogMessage = () => {
    if (!pendingPreview) return '';
    if (pendingPreview.toImportCount === 0) {
      return `All ${pendingPreview.totalInBackup} expense(s) in this backup already exist in your records. No new expenses will be imported.`;
    }
    if (pendingPreview.duplicateCount > 0) {
      return `This backup contains ${pendingPreview.totalInBackup} expense(s):\n\n• ${pendingPreview.toImportCount} new expense(s) will be restored\n• ${pendingPreview.duplicateCount} duplicate(s) already exist and will be skipped.\n\nDo you want to proceed?`;
    }
    return `Restore ${pendingPreview.toImportCount} expense(s) from this backup into your personal records?`;
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* App Identity Banner */}
      <View style={styles.headerBox}>
        <View style={styles.iconCircle}>
          <Ionicons name="wallet" size={32} color={colors.primary} />
        </View>
        <Text style={styles.appName}>Spendly</Text>
        <Text style={styles.appTagline}>
          Simple, private expense tracking & roommate bill management.
        </Text>
      </View>

      {/* Account & Session Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account & Sync</Text>
        <Card style={styles.infoCard}>
          {user ? (
            <View style={styles.userContainer}>
              <View style={styles.userRow}>
                <View style={styles.userAvatar}>
                  <Text style={styles.avatarText}>
                    {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{user.displayName || 'Spendly User'}</Text>
                  <Text style={styles.userEmail}>{user.email}</Text>
                </View>
              </View>

              <View style={styles.authDivider} />

              <Button
                title="Sign Out"
                variant="outline"
                onPress={() => setLogoutDialogVisible(true)}
                style={styles.signOutBtn}
              />
            </View>
          ) : (
            <View style={styles.guestContainer}>
              <View style={styles.guestHeader}>
                <Ionicons name="person-circle-outline" size={24} color={colors.textSecondary} />
                <View style={styles.guestInfo}>
                  <Text style={styles.guestTitle}>Guest Mode</Text>
                  <Text style={styles.guestDesc}>Personal offline expense tracking is active.</Text>
                </View>
              </View>

              <Button
                title="Sign In / Register"
                onPress={() => router.push('/auth/login')}
                style={styles.signInBtn}
              />
            </View>
          )}
        </Card>
      </View>

      {/* Push Notifications Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Push Notifications</Text>
        <Card style={styles.infoCard}>
          <View style={styles.notifRow}>
            <View style={styles.notifIconCircle}>
              <Ionicons
                name={notificationsEnabled ? 'notifications' : 'notifications-off-outline'}
                size={22}
                color={notificationsEnabled ? colors.primary : colors.textMuted}
              />
            </View>
            <View style={styles.notifTextCol}>
              <View style={styles.notifStatusBadgeRow}>
                <Text style={styles.notifTitle}>Expense Alerts</Text>
                <View
                  style={[
                    styles.statusPill,
                    notificationsEnabled ? styles.statusPillActive : styles.statusPillInactive,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      notificationsEnabled ? styles.statusPillTextActive : styles.statusPillTextInactive,
                    ]}
                  >
                    {notificationsEnabled === null
                      ? 'Checking...'
                      : notificationsEnabled
                      ? 'Enabled'
                      : 'Disabled'}
                  </Text>
                </View>
              </View>
              <Text style={styles.notifDesc}>
                {notificationsEnabled
                  ? 'Real-time alerts for expense reviews, repayments, and rejections.'
                  : 'Notifications are currently disabled. You can enable them in Android settings.'}
              </Text>
            </View>
          </View>

          <Button
            title={notificationsEnabled ? 'Notification Settings' : 'Enable in Android Settings'}
            variant="outline"
            onPress={() => NotificationService.openNotificationSettings()}
            style={styles.notifBtn}
          />
        </Card>
      </View>

      {/* Privacy & Local Storage */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Privacy & Storage</Text>
        <Card style={styles.privacyCard}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="shield-checkmark" size={22} color={colors.primary} />
            <Text style={styles.cardHeaderTitle}>Private On-Device Storage</Text>
          </View>
          <Text style={styles.bodyText}>
            Your personal expenses are stored entirely and securely on your device.
          </Text>
          <View style={styles.bulletList}>
            <View style={styles.bulletItem}>
              <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} style={styles.bulletIcon} />
              <Text style={styles.bulletText}>
                <Text style={styles.bold}>100% Private:</Text> Personal records stay on this phone and are never uploaded or visible to others.
              </Text>
            </View>
            <View style={styles.bulletItem}>
              <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} style={styles.bulletIcon} />
              <Text style={styles.bulletText}>
                <Text style={styles.bold}>Works Offline:</Text> Create, edit, and review your personal expenses anytime without internet.
              </Text>
            </View>
            <View style={styles.bulletItem}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.warningText} style={styles.bulletIcon} />
              <Text style={styles.bulletText}>
                <Text style={styles.bold}>Device-Bound:</Text> Clearing app data or uninstalling the app will permanently remove your local personal expenses.
              </Text>
            </View>
          </View>
        </Card>
      </View>

      {/* Personal Backup & Restore Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Backup & Restore</Text>
        <Card style={styles.infoCard}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="archive-outline" size={22} color={colors.primary} />
            <Text style={styles.cardHeaderTitle}>Personal Expense Backups</Text>
          </View>
          <Text style={styles.bodyText}>
            Export your personal expenses to a portable JSON backup file, or restore a previously saved backup onto this device.
          </Text>

          <View style={styles.backupScopeBox}>
            <Ionicons name="person-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.backupScopeText}>
              Active Scope: <Text style={styles.bold}>{user ? (user.displayName || user.email) : 'Guest (Offline)'}</Text>
            </Text>
          </View>

          <View style={styles.backupBtnGroup}>
            <Button
              title="Export Personal Backup"
              onPress={handleExportBackup}
              loading={exporting}
              style={styles.backupBtn}
            />
            <Button
              title="Import Backup File"
              variant="outline"
              onPress={handleImportFromFile}
              loading={importing}
              style={styles.backupBtn}
            />
            <Button
              title="Paste Backup JSON"
              variant="outline"
              onPress={() => setPasteModalVisible(true)}
              style={styles.backupGhostBtn}
            />
          </View>
        </Card>
      </View>

      {/* Financial Precision */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Financial Accuracy</Text>
        <Card style={styles.infoCard}>
          <View style={styles.bulletList}>
            <View style={styles.bulletItem}>
              <Ionicons name="calculator-outline" size={18} color={colors.textSecondary} style={styles.bulletIcon} />
              <Text style={styles.bulletText}>
                <Text style={styles.bold}>Exact Calculations:</Text> Every transaction is tracked to the exact paisa (₹0.01) to eliminate rounding errors.
              </Text>
            </View>
            <View style={styles.bulletItem}>
              <Ionicons name="cash-outline" size={18} color={colors.textSecondary} style={styles.bulletIcon} />
              <Text style={styles.bulletText}>
                <Text style={styles.bold}>Standard Limits:</Text> Supports expenses up to ₹9,99,99,999.99 with strict two-decimal precision.
              </Text>
            </View>
          </View>
        </Card>
      </View>

      {/* App Details */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About Application</Text>
        <Card style={styles.infoCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Application</Text>
            <Text style={styles.detailValue}>Spendly</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Version</Text>
            <Text style={styles.detailValue}>1.0.0</Text>
          </View>
          <View style={[styles.detailRow, styles.lastDetailRow]}>
            <Text style={styles.detailLabel}>Personal Data Mode</Text>
            <Text style={styles.detailValue}>Offline Local Storage</Text>
          </View>
        </Card>
      </View>

      {/* Logout Confirmation Dialog */}
      <ConfirmationDialog
        visible={logoutDialogVisible}
        title="Sign Out"
        message="Are you sure you want to sign out of Spendly? Your local personal expenses will remain safe on your device."
        confirmText="Sign Out"
        isDestructive
        loading={loggingOut}
        onConfirm={handleConfirmLogout}
        onCancel={() => setLogoutDialogVisible(false)}
      />

      {/* Paste Backup JSON Modal */}
      <Modal
        visible={pasteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPasteModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setPasteModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Paste Backup JSON</Text>
                  <TouchableOpacity onPress={() => setPasteModalVisible(false)}>
                    <Ionicons name="close" size={24} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.modalSub}>
                  Paste the JSON content from your exported Spendly personal backup file below:
                </Text>
                <TextInput
                  style={styles.pasteInput}
                  multiline
                  numberOfLines={8}
                  placeholder='{"version": 1, "dataType": "personal_expenses", ...}'
                  placeholderTextColor={colors.textMuted}
                  value={pastedJson}
                  onChangeText={setPastedJson}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View style={styles.modalBtnRow}>
                  <Button
                    title="Cancel"
                    variant="outline"
                    onPress={() => setPasteModalVisible(false)}
                    style={styles.modalBtn}
                  />
                  <Button
                    title="Validate & Review"
                    onPress={handleConfirmPaste}
                    style={styles.modalBtn}
                  />
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Import Confirmation Dialog */}
      <ConfirmationDialog
        visible={importConfirmVisible}
        title="Restore Personal Expenses"
        message={getRestoreDialogMessage()}
        confirmText={pendingPreview?.toImportCount === 0 ? 'OK' : 'Restore Now'}
        cancelText={pendingPreview?.toImportCount === 0 ? 'Close' : 'Cancel'}
        onConfirm={
          pendingPreview?.toImportCount === 0
            ? () => setImportConfirmVisible(false)
            : handleConfirmRestore
        }
        onCancel={() => setImportConfirmVisible(false)}
        loading={executingRestore}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  headerBox: {
    alignItems: 'center',
    marginVertical: spacing.md,
    marginBottom: spacing.xl,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  appName: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  appTagline: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 290,
    lineHeight: 18,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.sectionTitle,
    marginBottom: spacing.xs,
  },
  userContainer: {
    gap: spacing.md,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.h3,
    color: colors.primary,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    ...typography.bodyMedium,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  userEmail: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  authDivider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
  },
  signOutBtn: {
    width: '100%',
  },
  guestContainer: {
    gap: spacing.md,
  },
  guestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  guestInfo: {
    flex: 1,
  },
  guestTitle: {
    ...typography.bodyMedium,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  guestDesc: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  signInBtn: {
    width: '100%',
  },
  privacyCard: {
    borderColor: colors.primaryLight,
    backgroundColor: colors.surface,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  cardHeaderTitle: {
    ...typography.bodyMedium,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  bodyText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  bulletList: {
    gap: spacing.sm,
  },
  bulletItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  bulletIcon: {
    marginTop: 2,
    marginRight: 2,
  },
  bulletText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 19,
  },
  bold: {
    fontWeight: '600',
    color: colors.textPrimary,
  },
  infoCard: {
    gap: spacing.xs,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  lastDetailRow: {
    borderBottomWidth: 0,
  },
  detailLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  detailValue: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  notifIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  notifTextCol: {
    flex: 1,
  },
  notifStatusBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  notifTitle: {
    ...typography.bodyMedium,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  statusPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  statusPillActive: {
    backgroundColor: '#DCFCE7',
  },
  statusPillInactive: {
    backgroundColor: '#F1F5F9',
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  statusPillTextActive: {
    color: '#15803D',
  },
  statusPillTextInactive: {
    color: '#64748B',
  },
  notifDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  notifBtn: {
    marginTop: spacing.xs,
    width: '100%',
  },
  backupScopeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    marginBottom: spacing.md,
  },
  backupScopeText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  backupBtnGroup: {
    gap: spacing.sm,
  },
  backupBtn: {
    width: '100%',
  },
  backupGhostBtn: {
    width: '100%',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  modalTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  modalSub: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  pasteInput: {
    minHeight: 140,
    maxHeight: 220,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.background,
    padding: spacing.md,
    ...typography.bodySmall,
    color: colors.textPrimary,
    textAlignVertical: 'top',
    marginBottom: spacing.lg,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  modalBtn: {
    flex: 1,
  },
});
