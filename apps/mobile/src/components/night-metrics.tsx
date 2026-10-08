import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { useTheme } from '@/providers/theme-provider';

export function NightMetrics({
  drinks,
  water,
  compact = false,
}: {
  drinks: number;
  water: number;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {[
        {
          count: drinks,
          label: drinks === 1 ? 'drink' : 'drinks',
          icon: 'wine-outline' as const,
          ink: colors.text,
          fill: colors.surfaceSoft,
        },
        {
          count: water,
          label: water === 1 ? 'chaser' : 'chasers',
          icon: 'water-outline' as const,
          ink: colors.waterText,
          fill: colors.waterSoft,
        },
      ].map((metric) => (
        <View
          key={metric.icon}
          accessible
          accessibilityLabel={`${metric.count} ${metric.label} logged`}
          style={{
            flex: 1,
            minWidth: 110,
            padding: compact ? 12 : 18,
            borderRadius: 22,
            backgroundColor: metric.fill,
            gap: compact ? 4 : 8,
          }}
        >
          {!compact ? (
            <Ionicons name={metric.icon} size={22} color={metric.ink} accessible={false} />
          ) : null}
          <Text
            style={{
              color: metric.ink,
              fontSize: compact ? 28 : 44,
              lineHeight: compact ? 34 : 52,
              fontWeight: '600',
              letterSpacing: compact ? -0.5 : -2,
              fontVariant: ['tabular-nums'],
            }}
          >
            {metric.count}
          </Text>
          <Text style={{ color: metric.ink, fontSize: 14, fontWeight: '500' }}>{metric.label}</Text>
        </View>
      ))}
    </View>
  );
}
