import { createThemedStyles } from '../theme/themed-styles';
import React from 'react';
import { Modal, View, Text, TouchableWithoutFeedback } from 'react-native';
import { Button } from './Button';
import { colors } from '../theme/colors';
import { spacing, radii } from '../theme/spacing';
import { typography } from '../theme/typography';

export interface ConfirmationDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  /** Optional icon shown above the title; switches the dialog to a centered layout. */
  icon?: React.ReactNode;
  /** Extra content between the message and the buttons. */
  children?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function ConfirmationDialog({
  visible,
  title,
  message,
  icon,
  children,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDestructive = false,
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmationDialogProps) {
  const centered = Boolean(icon);
  // Backdrop taps and the Android back button must not cancel a request in flight.
  const dismiss = () => {
    if (!loading) onCancel();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
      <TouchableWithoutFeedback onPress={dismiss}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.dialog, centered && styles.centered]}>
              {icon}
              <Text style={[styles.title, centered && styles.centeredText]}>{title}</Text>
              {message ? (
                <Text style={[styles.message, centered && styles.centeredText, children ? styles.messageTight : null]}>
                  {message}
                </Text>
              ) : null}
              {children}
              <View style={styles.buttonRow}>
                <Button title={cancelText} onPress={onCancel} variant="outline" style={styles.button} disabled={loading} />
                <Button
                  title={confirmText}
                  onPress={onConfirm}
                  variant={isDestructive ? 'danger' : 'primary'}
                  style={styles.button}
                  loading={loading}
                />
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = createThemedStyles(() => ({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  dialog: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  centered: {
    alignItems: 'center',
  },
  centeredText: {
    textAlign: 'center',
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  message: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.xl,
  },
  messageTight: {
    marginBottom: spacing.md,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  button: {
    flex: 1,
  },
}));
