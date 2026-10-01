import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { KeyboardTypeOptions, TextInputProps } from 'react-native';
import { colors, radii } from '@/theme/tokens';

export function TextField({
  label,
  value,
  onChangeText,
  secureTextEntry = false,
  keyboardType = 'default',
  textContentType,
  autoCapitalize = 'sentences',
  autoCorrect = true,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  textContentType?: TextInputProps['textContentType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoCorrect?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        onBlur={() => setFocused(false)}
        onFocus={() => setFocused(true)}
        secureTextEntry={secureTextEntry}
        selectionColor={colors.primary}
        style={[styles.input, focused && styles.focused]}
        textContentType={textContentType}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  label: { color: colors.text, fontSize: 14, fontWeight: '600' },
  input: {
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.input,
    color: colors.text,
    backgroundColor: colors.surface,
    fontSize: 16,
  },
  focused: { borderColor: colors.primary },
});
