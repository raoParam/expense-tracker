export const colors = {
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
} as const;

export type Colors = typeof colors;
