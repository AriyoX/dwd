export const colors = {
  // Keep these in sync with the light theme in apps/web/src/app/globals.css.
  background: '#F8F4EF',
  surface: '#FFFDFC',
  surfaceRaised: '#EEE7E3',
  surfaceSoft: '#F4EEEA',
  text: '#18191D',
  muted: '#77747A',
  primary: '#4A102F',
  primaryHover: '#641A3D',
  primarySoft: '#F3E5EA',
  accent: '#8C3657',
  border: '#E7E1DD',
  water: '#70789B',
  waterText: '#444B69',
  waterSoft: '#ECEEF5',
  danger: '#AD4138',
  white: '#FFFFFF',
} as const;

export const radii = {
  card: 22,
  control: 12,
  input: 11,
  icon: 15,
  resume: 18,
  pill: 999,
} as const;

export const typography = {
  heading: {
    color: colors.text,
    fontSize: 34,
    lineHeight: 39,
    fontWeight: '600',
    letterSpacing: -1.8,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '600',
    letterSpacing: -0.5,
  },
  body: { color: colors.muted, fontSize: 14, lineHeight: 22 },
} as const;
