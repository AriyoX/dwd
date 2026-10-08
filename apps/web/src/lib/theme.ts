import { darkTheme, lightTheme, type ThemePalette } from '@dwd/core';

function variables(palette: ThemePalette) {
  return Object.entries(palette)
    .map(
      ([role, color]) =>
        `--${role.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}:${color};`,
    )
    .join('');
}

// Rendered in the document head, so every route uses the native app's palette.
export const themeCss = `:root{${variables(lightTheme)}}:root[data-theme='dark']{${variables(darkTheme)}}`;
