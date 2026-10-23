import { createThemedStyles } from '../theme/themed-styles';
import React from 'react';
import {
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PersonalExpense } from '../domain/types';
import { getCategoryById } from '../constants/categories';
import { formatDisplayDate } from '../utils/date';
import { AmountText } from './AmountText';
import { colors } from '../theme/colors';
import { spacing, radii } from '../theme/spacing';
import { typography } from '../theme/typography';

export interface ExpenseRowProps {
  expense: PersonalExpense;
  onPress: () => void;
  style?: ViewStyle;
}

export function ExpenseRow({ expense, onPress, style }: ExpenseRowProps) {
  const category = getCategoryById(expense.categoryId);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.container, style]}
    >
      <View
        style={[
          styles.iconContainer,
          { backgroundColor: `${category.color}15` },
        ]}
      >
        <Ionicons
          name={category.icon as any}
          size={20}
          color={category.color}
        />
      </View>

      <View style={styles.detailsContainer}>
        <Text style={styles.title} numberOfLines={1}>
          {expense.title}
        </Text>
        <View style={styles.subRow}>
          <Text style={styles.categoryName}>{category.name}</Text>
          <Text style={styles.dot}>•</Text>
          <Text style={styles.date}>{formatDisplayDate(expense.expenseDate)}</Text>
        </View>
        {expense.description ? (
          <Text style={styles.description} numberOfLines={1}>
            {expense.description}
          </Text>
        ) : null}
      </View>

      <View style={styles.amountContainer}>
        <AmountText
          amountPaise={expense.amountPaise}
          variant="medium"
          color={colors.textPrimary}
        />
        <Ionicons
          name="chevron-forward"
          size={16}
          color={colors.textMuted}
          style={styles.chevron}
        />
      </View>
    </TouchableOpacity>
  );
}

const styles = createThemedStyles(() => ({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  detailsContainer: {
    flex: 1,
    marginRight: spacing.sm,
  },
  title: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  categoryName: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  dot: {
    ...typography.caption,
    color: colors.textMuted,
    marginHorizontal: 4,
  },
  date: {
    ...typography.caption,
    color: colors.textMuted,
  },
  description: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
    fontStyle: 'italic',
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  chevron: {
    marginLeft: 4,
  },
}));
