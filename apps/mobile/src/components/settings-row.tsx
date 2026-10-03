import { Pressable, Switch, Text, View } from 'react-native';
import { useTheme } from '@/providers/theme-provider';

export function SettingsRow({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const { colors, typography } = useTheme();
  return (
    <Pressable
      accessible
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={({ pressed }) => ({
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        opacity: disabled ? 0.6 : pressed ? 0.8 : 1,
      })}
    >
      <Text style={[typography.body, { flex: 1, color: colors.text }]}>{label}</Text>
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Switch
          accessible={false}
          value={value}
          disabled={disabled}
          trackColor={{ true: colors.primary }}
        />
      </View>
    </Pressable>
  );
}
