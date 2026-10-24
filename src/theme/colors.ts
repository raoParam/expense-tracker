const lightColors = {
  // Brand & Accents
  primary: '#4F46E5', // Indigo 600
  primaryDark: '#4338CA',
  primaryLight: '#EEF2FF',
  primaryMuted: '#C7D2FE',

  // Neutrals / Surfaces
  background: '#F8FAFC', // Slate 50
  surface: '#FFFFFF',
  surfaceSubtle: '#F1F5F9', // Slate 100
  surfaceElevated: '#FFFFFF',

  // Text
  textPrimary: '#0F172A', // Slate 900
  textSecondary: '#475569', // Slate 600
  textMuted: '#94A3B8', // Slate 400
  textInverse: '#FFFFFF',

  // Borders & Dividers
  border: '#E2E8F0', // Slate 200
  borderFocus: '#6366F1', // Indigo 500
  borderSubtle: '#F1F5F9',

  // Status & Semantics
  success: '#10B981', // Emerald 500
  successLight: '#ECFDF5',
  successText: '#065F46',

  warning: '#F59E0B', // Amber 500
  warningLight: '#FFFBEB',
  warningText: '#92400E',

  danger: '#EF4444', // Red 500
  dangerLight: '#FEF2F2',
  dangerText: '#991B1B',

  info: '#3B82F6', // Blue 500
  infoLight: '#EFF6FF',
  infoText: '#1E40AF',

  // Summary card tokens
  summaryBackground: '#4338CA',
  summaryText: '#FFFFFF',
  summaryMuted: '#C7D2FE',
  summaryBorder: 'rgba(255, 255, 255, 0.15)',
  summaryBadge: 'rgba(255, 255, 255, 0.2)',

  // Secondary button & container tokens
  secondaryBackground: '#EEF2FF',
  secondaryText: '#4338CA',
  secondaryBorder: 'transparent',
} as const;

export type Colors = { [Key in keyof typeof lightColors]: string };

const darkColors: Colors = {
  ...lightColors,
  primary: '#FAFAFA',
  primaryDark: '#FAFAFA',
  primaryLight: '#1C1C1E',
  primaryMuted: '#A8A8A8',
  background: '#000000',
  surface: '#121212',
  surfaceSubtle: '#1C1C1E',
  surfaceElevated: '#121212',
  textPrimary: '#FAFAFA',
  textSecondary: '#A8A8A8',
  textMuted: '#737373',
  textInverse: '#000000',
  border: '#262626',
  borderFocus: '#FAFAFA',
  borderSubtle: '#262626',
  success: '#4ADE80',
  successLight: '#102A1A',
  successText: '#4ADE80',
  warning: '#FBBF24',
  warningLight: '#2A2108',
  warningText: '#FBBF24',
  danger: '#F87171',
  dangerLight: '#2A1111',
  dangerText: '#F87171',
  info: '#A8A8A8',
  infoLight: '#1C1C1E',
  infoText: '#A8A8A8',
  summaryBackground: '#1C1C1E',
  summaryText: '#FAFAFA',
  summaryMuted: '#A8A8A8',
  summaryBorder: '#262626',
  summaryBadge: '#262626',
  secondaryBackground: '#1C1C1E',
  secondaryText: '#FAFAFA',
  secondaryBorder: '#262626',
};

// Keep the existing token import API stable while allowing the root theme
// provider to apply a persisted palette before screens are mounted.
export const colors = { ...lightColors };

let activeColorTheme: 'light' | 'dark' = 'light';

export function getColorTheme(): 'light' | 'dark' {
  return activeColorTheme;
}

export function applyColorTheme(mode: 'light' | 'dark'): void {
  activeColorTheme = mode;
  Object.assign(colors, mode === 'dark' ? darkColors : lightColors);
}
