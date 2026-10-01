import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';
import { useTheme } from '@/providers/theme-provider';

/** Decorative, scalable artwork. Never used to represent plan progress. */
export function NightArtwork({ compact = false }: { compact?: boolean }) {
  const { colors } = useTheme();
  return (
    <Svg width="100%" height={compact ? 110 : 170} viewBox="0 0 320 190" accessible={false}>
      <Ellipse cx="160" cy="170" rx="118" ry="10" fill={colors.primary} opacity={0.06} />
      <Path d="M70 166V90a90 90 0 0 1 180 0v76" fill={colors.primarySoft} />
      <Path d="M94 160V90a66 66 0 0 1 132 0v70" fill="none" stroke={colors.accent} opacity={0.2} />
      <Path d="M211 32a19 19 0 1 0 22 25 20 20 0 0 1-22-25" fill={colors.accent} />
      <G transform="rotate(-13 115 107)">
        <Path
          d="M88 60h54l-5 43c-3 25-41 25-44 0z"
          fill={colors.surface}
          stroke={colors.primary}
          strokeWidth="2.5"
        />
        <Path d="M93 85h44l-3 20c-4 18-32 18-37 0z" fill={colors.accent} />
        <Path
          d="M115 123v40m-18 0h36"
          stroke={colors.primary}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </G>
      <G transform="rotate(11 204 128)">
        <Path
          d="M180 94h49l-6 67h-37z"
          fill={colors.surface}
          stroke={colors.waterText}
          strokeWidth="2.5"
        />
        <Path d="M185 121h39l-3 37h-33z" fill={colors.water} opacity={0.6} />
        <Path d="m207 134 9-64" stroke={colors.waterText} strokeWidth="3" strokeLinecap="round" />
        <Circle
          cx="186"
          cy="95"
          r="15"
          fill={colors.surface}
          stroke={colors.accent}
          strokeWidth="2"
        />
        <Path
          d="M175 95h22m-11-11v22m-8-19 16 16m0-16-16 16"
          stroke={colors.accent}
          strokeWidth="1.5"
        />
      </G>
      <Path
        d="M53 65v14m-7-7h14m204 47v12m-6-6h12"
        stroke={colors.accent}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <Circle cx="270" cy="66" r="3" fill={colors.water} />
      <Circle cx="70.5" cy="134.5" r="2.5" fill={colors.accent} />
    </Svg>
  );
}
