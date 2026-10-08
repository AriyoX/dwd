import { describe, expect, it } from 'vitest';
import { darkTheme, lightTheme } from './theme';

function luminance(hex: string) {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return channel(1) * 0.2126 + channel(3) * 0.7152 + channel(5) * 0.0722;
}

function contrast(foreground: string, background: string) {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe.each([
  ['light', lightTheme],
  ['dark', darkTheme],
] as const)('%s color contrast', (_, theme) => {
  const surfaces = [
    theme.background,
    theme.surface,
    theme.surfaceContainerLow,
    theme.surfaceContainerHigh,
    theme.surfaceSoft,
    theme.primaryContainer,
  ];
  it('keeps body, secondary and action text at 4.5:1 across surfaces', () => {
    for (const surface of surfaces) {
      for (const ink of [theme.onSurface, theme.onSurfaceVariant, theme.action]) {
        expect(contrast(ink, surface), `${ink} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
  it('keeps filled controls and semantic containers readable', () => {
    const pairs: [string, string][] = [
      [theme.onPrimary, theme.primary],
      [theme.onPrimaryContainer, theme.primaryContainer],
      [theme.onSecondary, theme.secondary],
      [theme.onSecondaryContainer, theme.secondaryContainer],
      [theme.onTertiary, theme.tertiary],
      [theme.onTertiaryContainer, theme.tertiaryContainer],
      [theme.onError, theme.error],
      [theme.onErrorContainer, theme.errorContainer],
      [theme.onDangerContainer, theme.dangerContainer],
      [theme.warning, theme.warningContainer],
      [theme.inverseOnSurface, theme.inverseSurface],
    ];
    for (const [ink, fill] of pairs) {
      expect(contrast(ink, fill), `${ink} on ${fill}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('keeps control outlines and selection accents at 3:1', () => {
    for (const surface of surfaces) {
      for (const ink of [theme.outline, theme.accent]) {
        expect(contrast(ink, surface), `${ink} on ${surface}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
