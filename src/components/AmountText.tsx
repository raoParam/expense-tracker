import React from 'react';
import { Text, TextStyle, StyleSheet } from 'react-native';
import { formatINR } from '../domain/money';
import { typography } from '../theme/typography';
import { colors } from '../theme/colors';

export interface AmountTextProps {
  amountPaise: number;
  variant?: 'hero' | 'large' | 'medium' | 'small';
  color?: string;
  showSymbol?: boolean;
  style?: TextStyle;
}

export function AmountText({
  amountPaise,
  variant = 'medium',
  color,
  showSymbol = true,
  style,
}: AmountTextProps) {
  const formatted = formatINR(amountPaise, showSymbol);

  let variantStyle: TextStyle;
  switch (variant) {
    case 'hero':
      variantStyle = typography.amountHero;
      break;
    case 'large':
      variantStyle = typography.amountLarge;
      break;
    case 'small':
      variantStyle = typography.amountSmall;
      break;
    case 'medium':
    default:
      variantStyle = typography.amountMedium;
      break;
  }

  return (
    <Text
      style={[
        variantStyle,
        color ? { color } : undefined,
        style,
      ]}
      numberOfLines={1}
      adjustsFontSizeToFit
    >
      {formatted}
    </Text>
  );
}
