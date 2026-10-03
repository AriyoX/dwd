import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { useTheme } from '@/providers/theme-provider';
import { Action } from './primary-button';

export function Choice({
  label,
  detail,
  selected,
  onPress,
  disabled = false,
  compact = false,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Action
      label={label}
      selected={selected}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 52,
        padding: compact ? 10 : 16,
        gap: compact ? 6 : 12,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 16,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? colors.primarySoft : colors.surface,
      }}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{label}</Text>
        {detail ? (
          <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>{detail}</Text>
        ) : null}
      </View>
      <Ionicons
        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
        size={compact ? 18 : 22}
        color={selected ? colors.primary : colors.muted}
        accessible={false}
      />
    </Action>
  );
}
