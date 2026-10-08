/* eslint-disable @typescript-eslint/no-deprecated -- Exercise the provider without a device. */
import { createElement, useEffect, useSyncExternalStore } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from '@/providers/theme-provider';

const appearance = vi.hoisted(() => ({
  system: 'light' as 'light' | 'dark',
  override: 'unspecified' as 'light' | 'dark' | 'unspecified',
  listeners: new Set<() => void>(),
  background: vi.fn(() => Promise.resolve()),
}));
vi.mock('expo-sqlite/localStorage/install', () => ({}));
vi.mock('expo-system-ui', () => ({ setBackgroundColorAsync: appearance.background }));
vi.mock('react-native', () => ({
  useColorScheme: () =>
    useSyncExternalStore(
      (listener) => {
        appearance.listeners.add(listener);
        return () => appearance.listeners.delete(listener);
      },
      () => (appearance.override === 'unspecified' ? appearance.system : appearance.override),
    ),
  Appearance: {
    setColorScheme: (value: 'light' | 'dark' | 'unspecified') => {
      appearance.override = value;
      appearance.listeners.forEach((listener) => listener());
    },
  },
  StyleSheet: { create: (styles: unknown) => styles },
  AccessibilityInfo: {
    isReduceTransparencyEnabled: () => Promise.resolve(false),
    addEventListener: () => ({ remove: vi.fn() }),
  },
}));

let theme: ReturnType<typeof useTheme>;
let tree: ReactTestRenderer;
function Consumer() {
  const value = useTheme();
  useEffect(() => {
    theme = value;
  }, [value]);
  return null;
}
async function systemTheme(value: 'light' | 'dark') {
  await act(() => {
    appearance.system = value;
    appearance.listeners.forEach((listener) => listener());
  });
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  appearance.system = 'light';
  appearance.override = 'unspecified';
  appearance.background.mockClear();
  await act(() => {
    tree = create(createElement(ThemeProvider, null, createElement(Consumer)));
  });
});
afterEach(async () => {
  await act(() => tree.unmount());
  vi.unstubAllGlobals();
});

describe('native appearance', () => {
  it('follows live system changes and updates the native background', async () => {
    expect(theme.scheme).toBe('light');
    await systemTheme('dark');
    expect(theme.scheme).toBe('dark');
    expect(theme.colors.background).toBe('#160B12');
    expect(appearance.background).toHaveBeenLastCalledWith('#160B12');
    await systemTheme('light');
    expect(theme.scheme).toBe('light');
    expect(appearance.background).toHaveBeenLastCalledWith('#F8F4EF');
  });
  it('holds explicit choices and resumes following the system when selected', async () => {
    await act(() => theme.setPreference('dark'));
    expect(theme.scheme).toBe('dark');
    expect(localStorage.getItem('dwd:mobile:appearance')).toBe('dark');
    await systemTheme('dark');
    await systemTheme('light');
    expect(theme.scheme).toBe('dark');
    await act(() => theme.setPreference('system'));
    expect(theme.scheme).toBe('light');
    expect(appearance.override).toBe('unspecified');
    await systemTheme('dark');
    expect(theme.scheme).toBe('dark');
  });
});
