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
  tone = 'default',
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  detail?: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  busyLabel?: string;
  showChevron?: boolean;
  tone?: 'default' | 'neutral' | 'danger';
}) {
  const { colors, typography } = useTheme();
  const ink =
    tone === 'danger' ? colors.danger : tone === 'neutral' ? colors.muted : colors.primary;
  const fill =
    tone === 'danger'
      ? colors.dangerContainer
      : tone === 'neutral'
        ? colors.surfaceSoft
        : colors.primarySoft;
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
          backgroundColor: fill,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {busy ? (
          <ActivityIndicator color={ink} accessible={false} />
        ) : (
          <Ionicons name={icon} size={20} color={ink} accessible={false} />
        )}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text
          style={{
            ...typography.body,
            color: tone === 'default' ? colors.text : ink,
            fontSize: 16,
            fontWeight: '500',
          }}
        >
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
