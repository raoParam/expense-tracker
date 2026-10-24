import { createThemedStyles } from '../theme/themed-styles';
import React, { useCallback, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './Button';
import { useKeyboardOverlap } from './keyboard-policy';
import { colors } from '../theme/colors';
import { spacing, radii } from '../theme/spacing';
import { typography } from '../theme/typography';

export interface KeyboardComposerModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  submitVariant?: 'primary' | 'secondary' | 'outline' | 'danger';
  submitting?: boolean;
  submitDisabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  numberOfLines?: number;
  autoFocus?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  containerStyle?: ViewStyle;
}

/**
 * Dedicated bottom composer modal for multiline text input (e.g. rejection reasons,
 * backup-paste). Positions the active input and clear confirmation action directly
 * above the soft keyboard on Android and iOS without hiding buttons or jumping.
 */
export function KeyboardComposerModal({
  visible,
  onClose,
  title,
  subtitle,
  icon,
  value,
  onChangeText,
  onSubmit,
  submitLabel = 'Confirm',
  cancelLabel = 'Cancel',
  submitVariant = 'primary',
  submitting = false,
  submitDisabled = false,
  placeholder,
  maxLength,
  numberOfLines = 3,
  autoFocus = true,
  autoCapitalize = 'sentences',
  autoCorrect = true,
  containerStyle,
}: KeyboardComposerModalProps) {
  const insets = useSafeAreaInsets();
  const { ref, overlap, onLayout } = useKeyboardOverlap();
  const isSubmittingRef = useRef(false);

  const handleSubmit = useCallback(() => {
    if (submitting || submitDisabled || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
      onSubmit();
    } finally {
      // Release lock on next frame
      requestAnimationFrame(() => {
        isSubmittingRef.current = false;
      });
    }
  }, [onSubmit, submitting, submitDisabled]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View ref={ref} onLayout={onLayout} style={[styles.backdrop, { paddingBottom: overlap }]}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.dismissArea} />
        </TouchableWithoutFeedback>

        <View style={styles.keyboardContainer}>
          <View
            style={[
              styles.composerCard,
              { paddingBottom: overlap ? spacing.md : Math.max(insets.bottom, spacing.md) },
              containerStyle,
            ]}
          >
            {/* Header row */}
            <View style={styles.headerRow}>
              <View style={styles.titleContainer}>
                {icon}
                <Text style={styles.titleText}>{title}</Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Close dialog"
                disabled={submitting}
              >
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Optional subtitle description */}
            {subtitle ? <Text style={styles.subtitleText}>{subtitle}</Text> : null}

            {/* Input area */}
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.textInput}
                placeholder={placeholder}
                placeholderTextColor={colors.textMuted}
                value={value}
                onChangeText={onChangeText}
                multiline
                numberOfLines={numberOfLines}
                maxLength={maxLength}
                autoFocus={autoFocus}
                disableFullscreenUI
                autoCapitalize={autoCapitalize}
                autoCorrect={autoCorrect}
                textAlignVertical="top"
                editable={!submitting}
              />
              {maxLength ? (
                <Text style={styles.charCounter}>
                  {value.length}/{maxLength}
                </Text>
              ) : null}
            </View>

            {/* Dedicated Action Bar directly above keyboard */}
            <View style={styles.actionsRow}>
              <Button
                title={cancelLabel}
                variant="outline"
                onPress={onClose}
                disabled={submitting}
                style={styles.cancelBtn}
              />
              <Button
                title={submitLabel}
                variant={submitVariant}
                onPress={handleSubmit}
                loading={submitting}
                disabled={submitDisabled || submitting}
                style={styles.submitBtn}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = createThemedStyles(() => ({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  dismissArea: {
    flex: 1,
  },
  keyboardContainer: {
    width: '100%',
    justifyContent: 'flex-end',
  },
  composerCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  titleText: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  subtitleText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  inputWrapper: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.background,
    padding: spacing.sm,
    minHeight: 96,
  },
  textInput: {
    ...typography.body,
    color: colors.textPrimary,
    minHeight: 72,
    maxHeight: 180,
  },
  charCounter: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  cancelBtn: {
    flex: 1,
  },
  submitBtn: {
    flex: 2,
  },
}));
