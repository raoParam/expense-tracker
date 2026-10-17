import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './Button';
import { colors } from '../theme/colors';
import { spacing, radii } from '../theme/spacing';
import { typography } from '../theme/typography';

export interface NotificationPermissionModalProps {
  visible: boolean;
  onEnable: () => void;
  onDismiss: () => void;
  loading?: boolean;
}

export function NotificationPermissionModal({
  visible,
  onEnable,
  onDismiss,
  loading = false,
}: NotificationPermissionModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <TouchableWithoutFeedback onPress={onDismiss}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.dialog}>
              <View style={styles.iconCircle}>
                <Ionicons name="notifications" size={28} color={colors.primary} />
              </View>

              <Text style={styles.title}>Enable Push Notifications?</Text>

              <Text style={styles.subtitle}>
                Stay up to date with your shared room expenses and repayments:
              </Text>

              <View style={styles.bulletList}>
                <View style={styles.bulletItem}>
                  <Ionicons name="receipt-outline" size={18} color={colors.primary} style={styles.bulletIcon} />
                  <Text style={styles.bulletText}>
                    Review and acknowledge or reject new shared expenses
                  </Text>
                </View>

                <View style={styles.bulletItem}>
                  <Ionicons name="swap-horizontal-outline" size={18} color={colors.success} style={styles.bulletIcon} />
                  <Text style={styles.bulletText}>
                    Get alerted when a settlement repayment needs verification
                  </Text>
                </View>

                <View style={styles.bulletItem}>
                  <Ionicons name="alert-circle-outline" size={18} color={colors.warning} style={styles.bulletIcon} />
                  <Text style={styles.bulletText}>
                    Know immediately if an expense was rejected and returned to you
                  </Text>
                </View>
              </View>

              <Text style={styles.disclaimer}>
                Spendly will only notify you for actions that need your attention. You can change this anytime in Android settings.
              </Text>

              <View style={styles.buttonCol}>
                <Button
                  title="Enable Notifications"
                  onPress={onEnable}
                  variant="primary"
                  loading={loading}
                  style={styles.actionBtn}
                />
                <Button
                  title="Not Now"
                  onPress={onDismiss}
                  variant="outline"
                  disabled={loading}
                  style={styles.dismissBtn}
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
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  dialog: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
    alignSelf: 'center',
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  bulletList: {
    backgroundColor: colors.background,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  bulletItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  bulletIcon: {
    marginRight: spacing.sm,
    marginTop: 2,
  },
  bulletText: {
    ...typography.caption,
    color: colors.textPrimary,
    flex: 1,
    lineHeight: 18,
  },
  disclaimer: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.lg,
    fontSize: 11,
    lineHeight: 16,
  },
  buttonCol: {
    gap: spacing.xs,
  },
  actionBtn: {
    width: '100%',
  },
  dismissBtn: {
    width: '100%',
  },
});
