import React from 'react';
import { Appearance, Platform, View } from 'react-native';
import {
  getThemeMode,
  saveThemeMode,
  ThemeMode,
} from '../services/preferences-service';
import { applyColorTheme, colors } from '../theme/colors';

interface ThemeContextValue {
  mode: ThemeMode;
  resolvedMode: 'light' | 'dark';
  ready: boolean;
  setMode: (mode: ThemeMode) => Promise<void>;
}

type SystemColorScheme = 'light' | 'dark' | 'unspecified' | null | undefined;

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined);

function resolveMode(mode: ThemeMode, systemScheme: SystemColorScheme): 'light' | 'dark' {
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  return systemScheme === 'dark' ? 'dark' : 'light';
}

function applyNativeColorScheme(mode: ThemeMode): void {
  if (Platform.OS === 'web') return;
  // This API is available in the React Native version bundled by Expo SDK 57.
  // Guarding it keeps web and test environments safe.
  const setColorScheme = (Appearance as unknown as {
    setColorScheme?: (scheme: 'light' | 'dark' | 'unspecified') => void;
  }).setColorScheme;
  setColorScheme?.(mode === 'system' ? 'unspecified' : mode);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = React.useState<ThemeMode>('system');
  const [systemScheme, setSystemScheme] = React.useState<SystemColorScheme>(() => {
    const scheme = Appearance.getColorScheme();
    // Resolve the first paint synchronously from the device appearance. The
    // persisted preference is loaded before the navigation tree is mounted.
    applyColorTheme(resolveMode('system', scheme));
    return scheme;
  });
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    getThemeMode()
      .then((storedMode) => {
        if (!active) return;
        setModeState(storedMode);
        applyNativeColorScheme(storedMode);
        applyColorTheme(resolveMode(storedMode, Appearance.getColorScheme()));
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
      if (mode === 'system') applyColorTheme(resolveMode('system', colorScheme));
    });
    return () => subscription.remove();
  }, [mode]);

  const setMode = React.useCallback(async (nextMode: ThemeMode) => {
    setModeState(nextMode);
    applyNativeColorScheme(nextMode);
    applyColorTheme(resolveMode(nextMode, Appearance.getColorScheme()));
    await saveThemeMode(nextMode);
  }, []);

  const value = React.useMemo(
    () => ({
      mode,
      resolvedMode: resolveMode(mode, systemScheme),
      ready,
      setMode,
    }),
    [mode, systemScheme, ready, setMode]
  );

  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  // A keyed subtree refreshes navigation options and screen-level styles that
  // are not themselves context consumers, without a reload or native change.
  return (
    <ThemeContext.Provider value={value}>
      <React.Fragment key={value.resolvedMode}>{children}</React.Fragment>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const value = React.useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used within ThemeProvider');
  return value;
}

export { resolveMode };
