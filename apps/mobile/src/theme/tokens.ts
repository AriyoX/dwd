import { darkTheme, lightTheme, type ThemePalette } from '@dwd/core';

function appColors(palette: ThemePalette) {
  return {
    ...palette,
    // Existing screen aliases all resolve to explicit shared roles.
    text: palette.onSurface,
    muted: palette.onSurfaceVariant,
    primary: palette.action,
    primaryFill: palette.primary,
    primarySoft: palette.primaryContainer,
    selectedBorder: palette.accent,
    border: palette.outlineVariant,
    water: palette.onSurfaceVariant,
    waterText: palette.onSurface,
    waterSoft: palette.surfaceContainerHigh,
    white: palette.surfaceBright,
  };
}
export const lightColors = appColors(lightTheme);
export type ThemeColors = ReturnType<typeof appColors>;
export const darkColors: ThemeColors = appColors(darkTheme);
export const radii = { card: 24, control: 14, input: 14, icon: 16, resume: 22, pill: 999 };
export function makeTypography(colors: ThemeColors) {
  return {
    heading: {
      color: colors.text,
      fontSize: 34,
      lineHeight: 41,
      fontWeight: '700',
      letterSpacing: -0.9,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 21,
      lineHeight: 28,
      fontWeight: '600',
      letterSpacing: -0.35,
    },
    body: { color: colors.muted, fontSize: 15, lineHeight: 23 },
  } as const;
}
