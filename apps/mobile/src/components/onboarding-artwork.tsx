import Svg, { Circle, Ellipse, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { useTheme } from '@/providers/theme-provider';

/** Original decorative scenes. These are illustrations, never live logs or progress. */
export function OnboardingArtwork({ scene, height = 300 }: { scene: number; height?: number }) {
  const { colors } = useTheme();
  return (
    <Svg width="100%" height={height} viewBox="0 0 340 310" accessible={false}>
      <Path
        d="M30 278V144a140 140 0 0 1 280 0v134Z"
        fill={scene === 1 ? colors.waterSoft : colors.primarySoft}
      />
      <Ellipse cx="170" cy="281" rx="144" ry="10" fill={colors.primary} opacity={0.07} />
      {scene === 0 ? (
        <>
          <Path d="M262 30a24 24 0 1 0 26 34 25 25 0 0 1-26-34" fill={colors.accent} />
          <G transform="rotate(-9 167 153)">
            <Rect
              transform="translate(69 56)"
              width="194"
              height="218"
              rx="18"
              fill={colors.surface}
              stroke={colors.border}
            />
            <Path d="M69 116h194" stroke={colors.border} />
            <SvgText
              transform="translate(88 85)"
              fontSize="11"
              fontWeight="600"
              fill={colors.muted}
            >
              TONIGHT
            </SvgText>
            <SvgText
              transform="translate(88 108)"
              fontSize="19"
              fontWeight="600"
              fill={colors.primary}
            >
              A little plan.
            </SvgText>
            <Circle cx="99" cy="151" r="13" fill={colors.primarySoft} />
            <Path
              d="m94 151 3 3 7-8"
              stroke={colors.accent}
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
            <Path
              d="M124 146h88m-88 10h57"
              stroke={colors.border}
              strokeWidth="5"
              strokeLinecap="round"
            />
            <Circle cx="99" cy="192" r="13" fill={colors.waterSoft} />
            <Path
              d="M99 184v8l5 3"
              stroke={colors.waterText}
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
            <Path
              d="M124 187h74m-74 10h46"
              stroke={colors.border}
              strokeWidth="5"
              strokeLinecap="round"
            />
            <Rect
              transform="translate(88 223)"
              width="157"
              height="30"
              rx="15"
              fill={colors.primarySoft}
            />
            <SvgText
              transform="translate(167 243)"
              textAnchor="middle"
              fontSize="12"
              fontWeight="600"
              fill={colors.primary}
            >
              Your own end time
            </SvgText>
          </G>
          <G transform="rotate(12 272 223)">
            <Rect
              transform="translate(260 150)"
              width="15"
              height="117"
              rx="7"
              fill={colors.accent}
            />
            <Path d="m260 266 8 16 7-16Z" fill={colors.muted} />
          </G>
        </>
      ) : scene === 1 ? (
        <>
          <Path d="M48 264h247" stroke={colors.water} strokeWidth="2" opacity={0.4} />
          <G transform="rotate(-10 124 170)">
            <Path
              d="M78 99h92l-9 71c-6 43-68 43-74 0Z"
              fill={colors.surface}
              stroke={colors.primary}
              strokeWidth="3"
            />
            <Path d="M85 132h78l-5 36c-6 33-58 33-63 0Z" fill={colors.accent} opacity={0.8} />
            <Path
              d="M124 203v60m-29 0h58"
              stroke={colors.primary}
              strokeWidth="3"
              strokeLinecap="round"
            />
            <Path
              d="M94 112h24"
              stroke={colors.primary}
              strokeWidth="2"
              strokeLinecap="round"
              opacity={0.2}
            />
          </G>
          <G transform="rotate(9 230 196)">
            <Path
              d="M195 142h72l-9 113h-54Z"
              fill={colors.surface}
              stroke={colors.waterText}
              strokeWidth="3"
            />
            <Path d="M202 181h58l-6 68h-46Z" fill={colors.water} opacity={0.55} />
            <Path
              d="m230 212 17-108"
              stroke={colors.waterText}
              strokeWidth="4"
              strokeLinecap="round"
            />
            <Circle
              cx="202"
              cy="143"
              r="21"
              fill={colors.surface}
              stroke={colors.accent}
              strokeWidth="2"
            />
            <Path
              d="M185 143h34m-17-17v34m-12-29 24 24m0-24-24 24"
              stroke={colors.accent}
              strokeWidth="1.5"
            />
          </G>
          <G transform="rotate(6 253 74)">
            <Rect
              transform="translate(207 48)"
              width="107"
              height="36"
              rx="18"
              fill={colors.surface}
              stroke={colors.border}
            />
            <Circle cx="225" cy="66" r="5" fill={colors.water} />
            <SvgText
              transform="translate(238 71)"
              fontSize="12"
              fontWeight="600"
              fill={colors.waterText}
            >
              Chasers, too
            </SvgText>
          </G>
          <Path
            d="M53 79c20-29 46-30 58-13m-7-13 8 14-16 1"
            stroke={colors.accent}
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <Ellipse
            cx="170"
            cy="243"
            rx="109"
            ry="37"
            fill={colors.surface}
            stroke={colors.border}
            strokeWidth="2"
          />
          <Path
            d="M104 260v25m132-25v25"
            stroke={colors.primary}
            strokeWidth="4"
            strokeLinecap="round"
          />
          <G>
            <Path
              d="M110 174c-25-1-42 19-42 43v21c17 11 39 16 60 13v-33c0-19-6-37-18-44"
              fill={colors.water}
            />
            <Circle
              cx="96"
              cy="146"
              r="25"
              fill={colors.surface}
              stroke={colors.waterText}
              strokeWidth="2"
            />
            <Path d="M73 139c1-26 39-32 47-6l-16-6-31 12" fill={colors.waterText} />
            <Path
              d="M211 178c23-9 46 5 51 28l6 25c-17 13-39 19-61 19l-6-28c-4-20-3-32 10-44"
              fill={colors.accent}
            />
            <Circle
              cx="239"
              cy="150"
              r="25"
              fill={colors.surface}
              stroke={colors.primary}
              strokeWidth="2"
            />
            <Path
              d="M216 151c-13-20 5-39 23-34 26-3 34 32 12 42l-5-24-15-6-15 22"
              fill={colors.primary}
            />
            <Path
              d="M148 193c-3-27 41-37 51-8l10 31c-17 15-42 15-61 3Z"
              fill={colors.primarySoft}
              stroke={colors.border}
            />
            <Circle
              cx="170"
              cy="141"
              r="25"
              fill={colors.surface}
              stroke={colors.accent}
              strokeWidth="2"
            />
            <Path d="M146 136c-3-22 31-36 47-13l-20-2-27 15" fill={colors.accent} />
            <Path
              d="M153 150c5 6 11 6 16 0m61 9c5 6 11 6 16 0m-159-5c5 6 11 6 16 0"
              fill="none"
              stroke={colors.muted}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </G>
          <G transform="rotate(-7 125 70)">
            <Rect
              transform="translate(73 44)"
              width="112"
              height="40"
              rx="20"
              fill={colors.surface}
              stroke={colors.border}
            />
            <Path d="m125 84 9 10 4-12" fill={colors.surface} stroke={colors.border} />
            <SvgText
              transform="translate(129 69)"
              textAnchor="middle"
              fontSize="13"
              fontWeight="600"
              fill={colors.primary}
            >
              Together?
            </SvgText>
          </G>
          <Path
            d="M209 63h34m-10-10 11 10-11 10"
            stroke={colors.accent}
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
        </>
      )}
    </Svg>
  );
}
