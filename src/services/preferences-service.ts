import AsyncStorage from '@react-native-async-storage/async-storage';

export const THEME_PREFERENCE_KEY = '@spendly/theme_mode';

export type ThemeMode = 'light' | 'dark' | 'system';

export async function getThemeMode(): Promise<ThemeMode> {
  const stored = await AsyncStorage.getItem(THEME_PREFERENCE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

export async function saveThemeMode(mode: ThemeMode): Promise<void> {
  await AsyncStorage.setItem(THEME_PREFERENCE_KEY, mode);
}
