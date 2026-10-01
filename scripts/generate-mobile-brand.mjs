import { readFileSync, writeFileSync } from 'node:fs';
import { format } from 'prettier';
import prettierConfig from '../prettier.config.mjs';

// Reuse the supplied vector, including its trimmed viewBox. Never stretch or redraw the mark.
const source = readFileSync(
  new URL('../apps/web/public/dwd/brand-mark.svg', import.meta.url),
  'utf8',
);
const paths = [...source.matchAll(/<path d="([^"]+)"/g)].map((match) =>
  match[1].replace(/\s+/g, ' '),
);
if (!paths.length) throw new Error('No brand paths found.');
const viewBox = source.match(/viewBox="([^"]+)"/)?.[1];
const transform = source.match(/<g transform="([^"]+)"/)?.[1];
if (!viewBox || !transform) throw new Error('Brand bounds missing.');
writeFileSync(
  new URL('../apps/mobile/src/components/brand.tsx', import.meta.url),
  await format(
    `// Generated from apps/web/public/dwd/brand-mark.svg by scripts/generate-mobile-brand.mjs.
import { View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { useTheme } from '@/providers/theme-provider';

const paths = ${JSON.stringify(paths, null, 2)};

export function Brand() {
  const { colors } = useTheme();
  return <View style={{ alignItems: 'flex-start', paddingVertical: 6 }}>
    <Svg accessible accessibilityLabel="dwd, Drink with Desire" accessibilityRole="image"
      width={96} height={96 * 412 / 1063} viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">
      <G transform="${transform}" fill={colors.brand}>
        {paths.map((path, index) => <Path key={index} d={path} />)}
      </G>
    </Svg>
  </View>;
}
`,
    { ...prettierConfig, parser: 'typescript' },
  ),
);
