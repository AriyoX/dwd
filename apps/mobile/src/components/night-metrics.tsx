import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { useTheme } from '@/providers/theme-provider';

export function NightMetrics({ drinks, water }: { drinks: number; water: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {[
        {
          count: drinks,
          label: drinks === 1 ? 'drink' : 'drinks',
          icon: 'wine-outline' as const,
          ink: colors.primary,
          fill: colors.primarySoft,
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
            padding: 18,
            borderRadius: 22,
            backgroundColor: metric.fill,
            gap: 8,
          }}
        >
          <Ionicons name={metric.icon} size={22} color={metric.ink} accessible={false} />
          <Text
            style={{
              color: metric.ink,
              fontSize: 44,
              lineHeight: 52,
              fontWeight: '600',
              letterSpacing: -2,
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
