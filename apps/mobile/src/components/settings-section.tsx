import { Children, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '@/providers/theme-provider';
import { Panel } from './screen';

export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text
        accessibilityRole="header"
        style={{ color: colors.muted, fontSize: 14, fontWeight: '600', paddingHorizontal: 4 }}
      >
        {title}
      </Text>
      <Panel style={{ paddingHorizontal: 16, paddingVertical: 4, gap: 0 }}>
        {Children.toArray(children).map((child, index) => (
          <View key={index} style={{ borderTopWidth: index ? 0.5 : 0, borderColor: colors.border }}>
            {child}
          </View>
        ))}
      </Panel>
    </View>
  );
}
