import { createThemedStyles } from '../theme/themed-styles';
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CATEGORIES, CategoryDefinition } from '../constants/categories';
import { colors } from '../theme/colors';
import { spacing, radii } from '../theme/spacing';
import { typography } from '../theme/typography';

export interface CategoryPickerProps {
  selectedCategoryId: string;
  onSelectCategory: (categoryId: string) => void;
  error?: string;
}

export function CategoryPicker({
  selectedCategoryId,
  onSelectCategory,
  error,
}: CategoryPickerProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Category</Text>
      <View style={styles.grid}>
        {CATEGORIES.map((cat: CategoryDefinition) => {
          const isSelected = cat.id === selectedCategoryId;
          return (
            <TouchableOpacity
              key={cat.id}
              onPress={() => onSelectCategory(cat.id)}
              activeOpacity={0.7}
              style={[
                styles.chip,
                isSelected && {
                  borderColor: cat.color,
                  backgroundColor: `${cat.color}15`,
                },
              ]}
            >
              <View
                style={[
                  styles.iconCircle,
                  { backgroundColor: `${cat.color}20` },
                  isSelected && { backgroundColor: cat.color },
                ]}
              >
                <Ionicons
                  name={cat.icon as any}
                  size={16}
                  color={isSelected ? colors.textInverse : cat.color}
                />
              </View>
              <Text
                style={[
                  styles.chipText,
                  isSelected && { color: cat.color, fontWeight: '700' },
                ]}
                numberOfLines={1}
              >
                {cat.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = createThemedStyles(() => ({
  container: {
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
  },
  chipText: {
    ...typography.caption,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.xs,
  },
}));
