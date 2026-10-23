import { ImageStyle, StyleSheet, TextStyle, ViewStyle } from 'react-native';
import { getColorTheme } from './colors';

type StyleValue = ViewStyle | TextStyle | ImageStyle;

/**
 * Creates a lazily resolved StyleSheet. The factory is evaluated after the
 * persisted theme has loaded and again when the palette changes, so color
 * tokens never get frozen at module import time.
 */
export function createThemedStyles<T extends Record<string, StyleValue>>(
  factory: () => T
): T {
  let cachedTheme: 'light' | 'dark' | undefined;
  let cachedStyles: T | undefined;

  return new Proxy({} as T, {
    get(_target, property: string | symbol) {
      const theme = getColorTheme();
      if (!cachedStyles || cachedTheme !== theme) {
        cachedTheme = theme;
        cachedStyles = StyleSheet.create(factory()) as T;
      }
      return cachedStyles[property as keyof T];
    },
  });
}
