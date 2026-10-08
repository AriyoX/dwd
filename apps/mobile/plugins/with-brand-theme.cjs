const {
  AndroidConfig,
  withAndroidColors,
  withAndroidColorsNight,
  withAndroidStyles,
} = require('@expo/config-plugins');
const palettes = require('../../../packages/core/src/config/theme-colors.json');

const roles = [
  'primary',
  'onPrimary',
  'primaryContainer',
  'onPrimaryContainer',
  'secondary',
  'onSecondary',
  'secondaryContainer',
  'onSecondaryContainer',
  'tertiary',
  'onTertiary',
  'tertiaryContainer',
  'onTertiaryContainer',
  'surface',
  'onSurface',
  'surfaceDim',
  'surfaceBright',
  'onSurfaceVariant',
  'surfaceContainerLowest',
  'surfaceContainerLow',
  'surfaceContainer',
  'surfaceContainerHigh',
  'surfaceContainerHighest',
  'outline',
  'outlineVariant',
  'error',
  'onError',
  'errorContainer',
  'onErrorContainer',
];
const attributes = Object.fromEntries(
  roles.map((role) => [`color${role[0].toUpperCase()}${role.slice(1)}`, role]),
);
Object.assign(attributes, {
  colorSurfaceInverse: 'inverseSurface',
  colorOnSurfaceInverse: 'inverseOnSurface',
  colorPrimaryInverse: 'inversePrimary',
  colorSurfaceVariant: 'surfaceContainerHigh',
  colorPrimaryVariant: 'primaryHover',
  colorSecondaryVariant: 'secondary',
  colorPrimaryFixed: 'primary',
  colorPrimaryFixedDim: 'primary',
  colorOnPrimaryFixed: 'onPrimary',
  colorOnPrimaryFixedVariant: 'onPrimary',
  colorSecondaryFixed: 'secondary',
  colorSecondaryFixedDim: 'secondary',
  colorOnSecondaryFixed: 'onSecondary',
  colorOnSecondaryFixedVariant: 'onSecondary',
  colorTertiaryFixed: 'tertiary',
  colorTertiaryFixedDim: 'tertiary',
  colorOnTertiaryFixed: 'onTertiary',
  colorOnTertiaryFixedVariant: 'onTertiary',
  'android:colorBackground': 'background',
  colorOnBackground: 'onBackground',
  colorAccent: 'action',
  colorControlActivated: 'action',
  colorControlNormal: 'onSurfaceVariant',
  colorControlHighlight: 'primaryContainer',
  'android:textColorPrimary': 'onSurface',
  'android:textColorSecondary': 'onSurfaceVariant',
});

function applyColors(xml, palette) {
  // Override the template's named colors too; some native styles reference them directly.
  for (const [name, value] of Object.entries({
    colorPrimary: palette.primary,
    colorAccent: palette.action,
  })) {
    xml = AndroidConfig.Colors.assignColorValue(xml, { name, value });
  }
  for (const role of new Set(Object.values(attributes))) {
    xml = AndroidConfig.Colors.assignColorValue(xml, {
      name: `dwd_${role}`,
      value: palette[role],
    });
  }
  return xml;
}

module.exports = function withBrandTheme(config) {
  config = withAndroidColors(config, (mod) => {
    mod.modResults = applyColors(mod.modResults, palettes.light);
    return mod;
  });
  config = withAndroidColorsNight(config, (mod) => {
    mod.modResults = applyColors(mod.modResults, palettes.dark);
    return mod;
  });
  return withAndroidStyles(config, (mod) => {
    const appTheme = mod.modResults.resources.style?.find((style) => style.$.name === 'AppTheme');
    if (appTheme) appTheme.$.parent = 'Theme.Material3.DayNight.NoActionBar';
    for (const [name, role] of Object.entries(attributes)) {
      mod.modResults = AndroidConfig.Styles.assignStylesValue(mod.modResults, {
        add: true,
        parent: AndroidConfig.Styles.getAppThemeGroup(),
        name,
        value: `@color/dwd_${role}`,
      });
    }
    return mod;
  });
};
