import React from 'react';
import { Text, TextStyle, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createThemedStyles } from '../../theme/themed-styles';
import { colors } from '../../theme/colors';
import { radii, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

type Tone = 'success' | 'warning' | 'danger' | 'neutral';

// Anything not listed (e.g. "pending") reads as a warning.
const TONES: Record<string, Tone> = {
  active: 'success',
  confirmed: 'success',
  verified: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
  archived: 'neutral',
};

export function StatusPill({
  status,
  label,
  large = false,
}: {
  status: string;
  label?: string;
  large?: boolean;
}) {
  const tone = TONES[status] ?? 'warning';
  return (
    <View style={[styles.pill, large && styles.pillLarge, styles[tone]]}>
      <Text style={[styles.pillText, large && styles.pillTextLarge, styles[`${tone}Text`]]}>
        {label ?? status.toUpperCase()}
      </Text>
    </View>
  );
}

export function SectionTitle({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  return <Text style={[styles.sectionTitle, style]}>{children}</Text>;
}

/** Info line: a strip along the bottom of a card, or a rounded box inside a dialog. */
export function InfoNote({ text, box = false }: { text: string; box?: boolean }) {
  return (
    <View style={box ? styles.noteBox : styles.noteStrip}>
      <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
      <Text style={styles.noteText}>{text}</Text>
    </View>
  );
}

export function SettledState({ text, iconSize = 32 }: { text: string; iconSize?: number }) {
  return (
    <View style={styles.settled}>
      <Ionicons name="checkmark-circle-outline" size={iconSize} color={colors.success} />
      <Text style={styles.settledText}>{text}</Text>
    </View>
  );
}

export function EmptyNote({ text }: { text: string }) {
  return <Text style={styles.emptyNote}>{text}</Text>;
}

/** Layout pieces shared by every room tab. */
export const ui = createThemedStyles(() => ({
  tabSection: {
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
}));

const styles = createThemedStyles(() => ({
  pill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radii.sm,
  },
  pillLarge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  pillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  pillTextLarge: {
    fontSize: 11,
  },
  success: { backgroundColor: colors.successLight },
  successText: { color: colors.success },
  warning: { backgroundColor: colors.warningLight },
  warningText: { color: colors.warning },
  danger: { backgroundColor: colors.dangerLight },
  dangerText: { color: colors.danger },
  neutral: { backgroundColor: colors.surfaceSubtle },
  neutralText: { color: colors.textMuted },
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  noteStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.md,
    backgroundColor: colors.surfaceSubtle,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceSubtle,
    padding: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.lg,
  },
  noteText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 16,
  },
  settled: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  settledText: {
    ...typography.bodyMedium,
    fontWeight: '600',
    color: colors.success,
  },
  emptyNote: {
    padding: spacing.md,
    ...typography.bodySmall,
    color: colors.textMuted,
    textAlign: 'center',
  },
}));
