import 'expo-sqlite/localStorage/install';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Appearance, StyleSheet, useColorScheme } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import { darkColors, lightColors, makeTypography, type ThemeColors } from '@/theme/tokens';

export type ThemePreference = 'system' | 'light' | 'dark';
const storageKey = 'dwd:mobile:appearance';
function readPreference(): ThemePreference {
  try {
    const saved = globalThis.localStorage.getItem(storageKey);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}
const ThemeContext = createContext<{
  preference: ThemePreference;
  scheme: 'light' | 'dark';
  colors: ThemeColors;
  typography: ReturnType<typeof makeTypography>;
  reduceTransparency: boolean;
  setPreference: (value: ThemePreference) => void;
} | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, updatePreference] = useState(readPreference);
  const [reduceTransparency, setReduceTransparency] = useState(false);
  const scheme =
    preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;
  const colors = scheme === 'dark' ? darkColors : lightColors;
  useEffect(() => {
    Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
    try {
      globalThis.localStorage.setItem(storageKey, preference);
    } catch {
      /* In-memory fallback. */
    }
  }, [preference]);
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background).catch(() => undefined);
  }, [colors]);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceTransparencyEnabled().then((value) => {
      if (active) setReduceTransparency(value);
    });
    const listener = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      setReduceTransparency,
    );
    return () => {
      active = false;
      listener.remove();
    };
  }, []);
  const value = useMemo(
    () => ({
      preference,
      scheme,
      colors,
      typography: makeTypography(colors),
      reduceTransparency,
      setPreference: updatePreference,
    }),
    [preference, scheme, colors, reduceTransparency],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme requires ThemeProvider.');
  return context;
}
export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (colors: ThemeColors, typography: ReturnType<typeof makeTypography>) => T,
): T {
  const { colors, typography } = useTheme();
  return useMemo(
    () => StyleSheet.create(factory(colors, typography)),
    [colors, typography, factory],
  );
}
