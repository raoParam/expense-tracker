import { TextStyle } from 'react-native';
import { colors, getColorTheme } from './colors';

const createTypography = () => ({
  h1: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 34,
    color: colors.textPrimary,
  } as TextStyle,
  h2: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
    color: colors.textPrimary,
  } as TextStyle,
  h3: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 24,
    color: colors.textPrimary,
  } as TextStyle,
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: colors.textSecondary,
  } as TextStyle,
  body: {
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 22,
    color: colors.textPrimary,
  } as TextStyle,
  bodyMedium: {
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
    color: colors.textPrimary,
  } as TextStyle,
  bodySmall: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
    color: colors.textSecondary,
  } as TextStyle,
  caption: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    color: colors.textMuted,
  } as TextStyle,
  button: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    color: colors.textInverse,
  } as TextStyle,
  amountHero: {
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 38,
    color: colors.textPrimary,
  } as TextStyle,
  amountLarge: {
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 30,
    color: colors.textPrimary,
  } as TextStyle,
  amountMedium: {
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 22,
    color: colors.textPrimary,
  } as TextStyle,
  amountSmall: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
    color: colors.textPrimary,
  } as TextStyle,
} as const);

let cachedTheme: 'light' | 'dark' | undefined;
let cachedTypography: ReturnType<typeof createTypography> | undefined;

export const typography = new Proxy({} as ReturnType<typeof createTypography>, {
  get(_target, property: string | symbol) {
    const theme = getColorTheme();
    if (!cachedTypography || cachedTheme !== theme) {
      cachedTheme = theme;
      cachedTypography = createTypography();
    }
    return cachedTypography[property as keyof typeof cachedTypography];
  },
});
