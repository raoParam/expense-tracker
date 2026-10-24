import { createThemedStyles } from '../../src/theme/themed-styles';
import React from 'react';
import {
  Alert,
  AppState,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/context/ThemeContext';
import { ThemeMode } from '../../src/services/preferences-service';
import { NotificationService } from '../../src/services/notification-service';
import { Button } from '../../src/components/Button';
import { useKeyboardOverlap } from '../../src/components/keyboard-policy';
import { Card } from '../../src/components/Card';
import { ConfirmationDialog } from '../../src/components/ConfirmationDialog';
import { colors } from '../../src/theme/colors';
import { radii, spacing } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';

const themeOptions: Array<{ mode: ThemeMode; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { mode: 'light', label: 'Light', icon: 'sunny-outline' },
  { mode: 'dark', label: 'Dark', icon: 'moon-outline' },
  { mode: 'system', label: 'System', icon: 'phone-portrait-outline' },
];

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout, updateDisplayName } = useAuth();
  const { mode, setMode } = useTheme();
  const keyboard = useKeyboardOverlap();
  const [notificationsEnabled, setNotificationsEnabled] = React.useState<boolean | null>(null);
  const [editVisible, setEditVisible] = React.useState(false);
  const [displayName, setDisplayName] = React.useState('');
  const [savingProfile, setSavingProfile] = React.useState(false);
  const [logoutVisible, setLogoutVisible] = React.useState(false);
  const [loggingOut, setLoggingOut] = React.useState(false);

  const refreshNotificationStatus = React.useCallback(async () => {
    try {
      const status = await NotificationService.getPermissionStatus();
      setNotificationsEnabled(status.granted || status.status === 'granted');
    } catch {
      setNotificationsEnabled(false);
    }
  }, []);

  React.useEffect(() => {
    refreshNotificationStatus();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshNotificationStatus();
    });
    return () => subscription.remove();
  }, [refreshNotificationStatus]);

  const openEditProfile = () => {
    setDisplayName(user?.displayName || '');
    setEditVisible(true);
  };

  const saveProfile = async () => {
    const nextName = displayName.trim();
    if (!nextName) {
      Alert.alert('Display name required', 'Enter a name that your roommates can recognize.');
      return;
    }
    if (nextName.length > 32) {
      Alert.alert('Display name too long', 'Display names can be up to 32 characters.');
      return;
    }

    setSavingProfile(true);
    try {
      await updateDisplayName(nextName);
      setEditVisible(false);
    } catch (error: any) {
      Alert.alert('Could not update profile', error?.message || 'Please try again.');
    } finally {
      setSavingProfile(false);
    }
  };

  const chooseTheme = async (nextMode: ThemeMode) => {
    try {
      await setMode(nextMode);
    } catch (error: any) {
      Alert.alert('Could not save appearance', error?.message || 'Please try again.');
    }
  };

  const confirmLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      setLogoutVisible(false);
    } catch (error: any) {
      Alert.alert('Logout Failed', error?.message || 'Failed to sign out.');
    } finally {
      setLoggingOut(false);
    }
  };

  const accountLabel = user?.displayName || user?.email || 'Spendly account';
  const initial = (user?.displayName || user?.email || 'U').charAt(0).toUpperCase();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.hero}>
        <View style={styles.avatar}>
          {user ? <Text style={styles.avatarText}>{initial}</Text> : <Ionicons name="person-outline" size={28} color={colors.textSecondary} />}
        </View>
        <Text style={styles.title}>{user ? accountLabel : 'Guest Mode'}</Text>
        <Text style={styles.subtitle}>
          {user?.email || 'Personal expenses stay available offline on this device.'}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <Card style={styles.card}>
          {user ? (
            <>
              <View style={styles.accountRow}>
                <View style={styles.accountCopy}>
                  <Text style={styles.itemTitle}>{user.displayName || 'Spendly User'}</Text>
                  <Text style={styles.itemDescription}>{user.email || 'Email unavailable'}</Text>
                </View>
                <Button
                  title="Edit"
                  variant="outline"
                  onPress={openEditProfile}
                  accessibilityHint="Change your display name"
                  style={styles.smallButton}
                />
              </View>
              <View style={styles.divider} />
              <Button
                title="Sign Out"
                variant="outline"
                onPress={() => setLogoutVisible(true)}
                accessibilityHint="Sign out of this Spendly account"
              />
            </>
          ) : (
            <>
              <Text style={styles.itemTitle}>Offline personal tracking</Text>
              <Text style={styles.itemDescription}>
                Sign in only when you want shared rooms, account sync, and notifications. No account details are shown in guest mode.
              </Text>
              <Button title="Sign In / Register" onPress={() => router.push('/auth/login')} style={styles.fullButton} />
            </>
          )}
        </Card>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Appearance</Text>
        <Card style={styles.card}>
          <Text style={styles.itemTitle}>App theme</Text>
          <Text style={styles.itemDescription}>Choose Light, Dark, or follow your device setting.</Text>
          <View style={styles.themeRow}>
            {themeOptions.map((option) => {
              const selected = mode === option.mode;
              return (
                <TouchableOpacity
                  key={option.mode}
                  style={[styles.themeOption, selected && styles.themeOptionSelected]}
                  onPress={() => chooseTheme(option.mode)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={`${option.label} theme`}
                >
                  <Ionicons name={option.icon} size={18} color={selected ? colors.primary : colors.textSecondary} />
                  <Text style={[styles.themeLabel, selected && styles.themeLabelSelected]}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>
        <Card style={styles.card}>
          <TouchableOpacity
            style={styles.navigationRow}
            onPress={() => NotificationService.openNotificationSettings()}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            accessibilityHint="Open notification settings"
          >
            <View style={styles.rowIcon}>
              <Ionicons
                name={notificationsEnabled ? 'notifications-outline' : 'notifications-off-outline'}
                size={20}
                color={notificationsEnabled ? colors.primary : colors.textMuted}
              />
            </View>
            <View style={styles.rowCopy}>
              <Text style={styles.itemTitle}>Notifications</Text>
              <Text style={styles.itemDescription}>
                {notificationsEnabled === null ? 'Checking permission status…' : notificationsEnabled ? 'Enabled' : 'Disabled'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.navigationRow}
            onPress={() => router.push('/about')}
            accessibilityRole="button"
            accessibilityLabel="About and Privacy"
            accessibilityHint="Open privacy, backup, and app information"
          >
            <View style={styles.rowIcon}>
              <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.rowCopy}>
              <Text style={styles.itemTitle}>About & Privacy</Text>
              <Text style={styles.itemDescription}>Backup, restore, privacy disclosures, and app version</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </Card>
      </View>

      <Text style={styles.footer}>Spendly keeps personal expense records private and local.</Text>

      <ConfirmationDialog
        visible={logoutVisible}
        title="Sign Out"
        message="Are you sure you want to sign out of Spendly? Your local personal expenses will remain safe on this device."
        confirmText="Sign Out"
        isDestructive
        loading={loggingOut}
        onConfirm={confirmLogout}
        onCancel={() => setLogoutVisible(false)}
      />

      <Modal
        visible={editVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setEditVisible(false)}>
          <View ref={keyboard.ref} onLayout={keyboard.onLayout} style={[styles.modalOverlay, { paddingBottom: spacing.lg + keyboard.overlap }]}>
            <TouchableWithoutFeedback>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Edit Profile</Text>
                <Text style={styles.modalDescription}>This name is synchronized with your Spendly account and shared-room membership.</Text>
                <TextInput
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Display name"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  maxLength={32}
                  autoFocus
                  disableFullscreenUI
                  returnKeyType="done"
                  onSubmitEditing={saveProfile}
                />
                <View style={styles.modalActions}>
                  <Button title="Cancel" variant="outline" onPress={() => setEditVisible(false)} style={styles.modalButton} disabled={savingProfile} />
                  <Button title="Save" onPress={saveProfile} style={styles.modalButton} loading={savingProfile} />
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </ScrollView>
  );
}

const styles = createThemedStyles(() => ({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  hero: { alignItems: 'center', paddingVertical: spacing.lg },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarText: { ...typography.h1, color: colors.primary },
  title: { ...typography.h2, color: colors.textPrimary, textAlign: 'center' },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs },
  section: { marginTop: spacing.lg },
  sectionTitle: { ...typography.sectionTitle, color: colors.textSecondary, marginBottom: spacing.xs },
  card: { gap: spacing.md },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  accountCopy: { flex: 1 },
  itemTitle: { ...typography.bodyMedium, color: colors.textPrimary, fontWeight: '600' },
  itemDescription: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 19, marginTop: spacing.xs },
  smallButton: { minWidth: 82 },
  fullButton: { marginTop: spacing.md },
  divider: { height: 1, backgroundColor: colors.borderSubtle },
  themeRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  themeOption: {
    flex: 1,
    minHeight: 54,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  themeOptionSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  themeLabel: { ...typography.caption, color: colors.textSecondary },
  themeLabelSelected: { color: colors.primary, fontWeight: '700' },
  navigationRow: { flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: spacing.md },
  rowIcon: { width: 32, alignItems: 'center' },
  rowCopy: { flex: 1 },
  footer: { ...typography.caption, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xxl },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  modalCard: { width: '100%', maxWidth: 420, backgroundColor: colors.surface, borderRadius: radii.xl, padding: spacing.xl, borderWidth: 1, borderColor: colors.border, elevation: 5 },
  modalTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.xs },
  modalDescription: { ...typography.bodySmall, color: colors.textSecondary, lineHeight: 19, marginBottom: spacing.lg },
  input: { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: spacing.md, ...typography.body, color: colors.textPrimary, marginBottom: spacing.lg },
  modalActions: { flexDirection: 'row', gap: spacing.md },
  modalButton: { flex: 1 },
}));
