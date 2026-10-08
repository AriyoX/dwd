import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Text, View } from 'react-native';
import { useTheme } from '@/providers/theme-provider';
import { Action } from './primary-button';

export function NavigationRow({
  label,
  icon,
  detail,
  onPress,
  disabled = false,
  busy = false,
  busyLabel,
  showChevron = true,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  detail?: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  busyLabel?: string;
  showChevron?: boolean;
}) {
  const { colors, typography } = useTheme();
  return (
    <Action
      label={busy && busyLabel ? busyLabel : detail ? `${label}, ${detail}` : label}
      onPress={onPress}
      disabled={disabled}
      busy={busy}
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
        {busy ? (
          <ActivityIndicator color={colors.primary} accessible={false} />
        ) : (
          <Ionicons name={icon} size={20} color={colors.primary} accessible={false} />
        )}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ ...typography.body, color: colors.text, fontSize: 16, fontWeight: '500' }}>
          {busy && busyLabel ? busyLabel : label}
        </Text>
        {detail ? <Text style={{ color: colors.muted, fontSize: 14 }}>{detail}</Text> : null}
      </View>
      {showChevron ? (
        <Ionicons name="chevron-forward" size={18} color={colors.muted} accessible={false} />
      ) : null}
    </Action>
  );
}
