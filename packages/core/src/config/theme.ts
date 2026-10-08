import palettes from './theme-colors.json' with { type: 'json' };

// Shared roles for native resources, app controls and web CSS. The signature
// dark rose is a fill; lighter action ink keeps text readable on raised surfaces.
export const lightTheme = palettes.light;
export type ThemePalette = { [Role in keyof typeof lightTheme]: string };
export const darkTheme: ThemePalette = palettes.dark;
