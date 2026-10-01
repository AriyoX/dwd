export const lightColors = {
  background: '#F8F4EF',
  surface: '#FFFDFC',
  surfaceRaised: '#EEE7E3',
  surfaceSoft: '#F4EEEA',
  text: '#18191D',
  muted: '#69636B',
  primary: '#4A102F',
  primaryHover: '#641A3D',
  primarySoft: '#F3E5EA',
  onPrimary: '#FFFFFF',
  brand: '#4A102F',
  accent: '#8C3657',
  border: '#E7E1DD',
  water: '#70789B',
  waterText: '#444B69',
  waterSoft: '#ECEEF5',
  danger: '#AD4138',
  white: '#FFFFFF',
};
export type ThemeColors = typeof lightColors;
export const darkColors: ThemeColors = {
  background: '#160B12',
  surface: '#21141B',
  surfaceRaised: '#35232E',
  surfaceSoft: '#2A1B24',
  text: '#F8F4EF',
  muted: '#B7ADB2',
  primary: '#D992AB',
  primaryHover: '#E9ACC1',
  primarySoft: '#3A2030',
  onPrimary: '#210E18',
  brand: '#F8F4EF',
  accent: '#E3A0B6',
  border: '#47313E',
  water: '#B3BDE3',
  waterText: '#CBD3F0',
  waterSoft: '#252A40',
  danger: '#FF9D90',
  white: '#FFFFFF',
};
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
