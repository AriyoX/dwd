import { ActivityIndicator, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/providers/theme-provider';
import { Action } from './primary-button';

export function DrinkLogButton({
  label,
  detail,
  onPress,
  busy = false,
  disabled = false,
  primary = false,
}: {
  label: string;
  detail: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  primary?: boolean;
}) {
  const { colors } = useTheme();
  const foreground = primary ? colors.onPrimary : colors.text;
  return (
    <Action
      label={`Log ${label}. ${detail}`}
      disabled={disabled || busy}
      busy={busy}
      onPress={onPress}
      style={{
        minHeight: 84,
        padding: 20,
        borderRadius: 20,
        backgroundColor: primary ? colors.primary : colors.surface,
        borderColor: colors.border,
        borderWidth: primary ? 0 : 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
      }}
    >
      <View style={{ flex: 1, gap: 5 }}>
        <Text style={{ color: foreground, fontSize: 20, fontWeight: '600' }}>Log {label}</Text>
        <Text
          style={{ color: primary ? colors.onPrimary : colors.muted, fontSize: 14, lineHeight: 20 }}
        >
          {detail}
        </Text>
      </View>
      {busy ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <Ionicons name="add-circle-outline" size={32} color={foreground} accessible={false} />
      )}
    </Action>
  );
}
