import { createThemedStyles } from '../theme/themed-styles';
import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getCategoryById } from '../constants/categories';
import { spacing, radii } from '../theme/spacing';
import { typography } from '../theme/typography';

export interface CategoryBadgeProps {
  categoryId: string;
  size?: 'small' | 'medium';
  showIcon?: boolean;
  style?: ViewStyle;
}

export function CategoryBadge({
  categoryId,
  size = 'medium',
  showIcon = true,
  style,
}: CategoryBadgeProps) {
  const category = getCategoryById(categoryId);
  const isSmall = size === 'small';

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: `${category.color}15` },
        isSmall && styles.containerSmall,
        style,
      ]}
    >
      {showIcon && (
        <Ionicons
          name={category.icon as any}
          size={isSmall ? 12 : 14}
          color={category.color}
          style={styles.icon}
        />
      )}
      <Text
        style={[
          styles.text,
          { color: category.color },
          isSmall && styles.textSmall,
        ]}
        numberOfLines={1}
      >
        {category.name}
      </Text>
    </View>
  );
}

const styles = createThemedStyles(() => ({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radii.full,
  },
  containerSmall: {
    paddingVertical: 2,
    paddingHorizontal: spacing.xs + 2,
  },
  icon: {
    marginRight: 4,
  },
  text: {
    ...typography.caption,
    fontWeight: '600',
  },
  textSmall: {
    fontSize: 11,
    lineHeight: 14,
  },
}));
