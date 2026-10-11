import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AmountText } from './AmountText';
import { colors } from '../theme/colors';
import { spacing, radii } from '../theme/spacing';
import { typography } from '../theme/typography';

export interface SummaryCardProps {
  title: string;
  subtitle?: string;
  totalPaise: number;
  count: number;
}

export function SummaryCard({
  title,
  subtitle,
  totalPaise,
  count,
}: SummaryCardProps) {
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>

      <View style={styles.amountRow}>
        <AmountText
          amountPaise={totalPaise}
          variant="hero"
          color={colors.textInverse}
        />
      </View>

      <View style={styles.footerRow}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {count} {count === 1 ? 'expense' : 'expenses'}
          </Text>
        </View>
        <Text style={styles.storageNote}>Stored locally on device</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.primaryDark,
    borderRadius: radii.xl,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    shadowColor: colors.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.sectionTitle,
    color: colors.primaryMuted,
    letterSpacing: 1,
  },
  subtitle: {
    ...typography.caption,
    color: colors.primaryLight,
  },
  amountRow: {
    marginVertical: spacing.xs,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.15)',
  },
  badge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  badgeText: {
    ...typography.caption,
    color: colors.textInverse,
    fontWeight: '600',
  },
  storageNote: {
    ...typography.caption,
    color: colors.primaryMuted,
    fontSize: 11,
  },
});
