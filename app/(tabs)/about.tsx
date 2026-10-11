import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { Card } from '../../src/components/Card';
import { Button } from '../../src/components/Button';
import { ConfirmationDialog } from '../../src/components/ConfirmationDialog';
import { colors } from '../../src/theme/colors';
import { spacing, radii } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';

export default function AboutScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [logoutDialogVisible, setLogoutDialogVisible] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

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
});
