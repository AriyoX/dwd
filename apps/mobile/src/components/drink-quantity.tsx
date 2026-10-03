import { Ionicons } from '@expo/vector-icons';
import { Text, TextInput, View } from 'react-native';
import { useTheme } from '@/providers/theme-provider';
import { Action } from './primary-button';

export function DrinkQuantity({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const { colors, scheme } = useTheme();
  const count = Number(value);
  const valid = Number.isInteger(count) && count >= 1 && count <= 50;
  function step(direction: -1 | 1) {
    return (
      <Action
        label={`${direction < 0 ? 'Fewer' : 'More'} planned drinks`}
        disabled={disabled || (valid && (direction < 0 ? count <= 1 : count >= 50))}
        onPress={() => onChange(String(valid ? Math.max(1, Math.min(50, count + direction)) : 1))}
        style={{
          minWidth: 48,
          minHeight: 48,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 12,
          backgroundColor: colors.surface,
        }}
      >
        <Ionicons
          name={direction < 0 ? 'remove' : 'add'}
          size={22}
          color={colors.primary}
          accessible={false}
        />
      </Action>
    );
  }
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>{label}</Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: 6,
          borderRadius: 18,
          backgroundColor: colors.primarySoft,
        }}
      >
        {step(-1)}
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChange}
          keyboardType="number-pad"
          keyboardAppearance={scheme}
          editable={!disabled}
          selectTextOnFocus
          style={{
            flex: 1,
            minHeight: 48,
            textAlign: 'center',
            color: colors.text,
            fontSize: 26,
            fontWeight: '600',
            padding: 0,
          }}
        />
        {step(1)}
      </View>
    </View>
  );
}
