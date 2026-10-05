import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { useTheme } from '@/providers/theme-provider';
import { Action } from './primary-button';

export function NavigationRow({
  label,
  icon,
  detail,
  onPress,
  disabled = false,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  detail?: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors, typography } = useTheme();
  return (
    <Action
      label={detail ? `${label}, ${detail}` : label}
      onPress={onPress}
      disabled={disabled}
      style={{
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 10,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 11,
          backgroundColor: colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={20} color={colors.primary} accessible={false} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={typography.body}>{label}</Text>
        {detail ? <Text style={{ color: colors.muted, fontSize: 14 }}>{detail}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} accessible={false} />
    </Action>
  );
}
