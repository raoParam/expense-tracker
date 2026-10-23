import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getThemeMode,
  saveThemeMode,
  THEME_PREFERENCE_KEY,
} from '../src/services/preferences-service';

describe('theme preference persistence', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('defaults to system without fabricating a preference', async () => {
    await expect(getThemeMode()).resolves.toBe('system');
    expect(AsyncStorage.getItem).toHaveBeenCalledWith(THEME_PREFERENCE_KEY);
  });

  it.each(['light', 'dark', 'system'] as const)('persists %s mode', async (mode) => {
    await saveThemeMode(mode);
    await expect(getThemeMode()).resolves.toBe(mode);
  });

  it('ignores invalid stored values', async () => {
    await AsyncStorage.setItem(THEME_PREFERENCE_KEY, 'neon');
    await expect(getThemeMode()).resolves.toBe('system');
  });
});
