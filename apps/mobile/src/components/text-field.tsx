import { useId, useState } from 'react';
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Action } from './primary-button';
import type { KeyboardTypeOptions, TextInputProps } from 'react-native';
import { radii, type ThemeColors } from '@/theme/tokens';
import { useTheme, useThemedStyles } from '@/providers/theme-provider';

export function TextField({
  label,
  value,
  onChangeText,
  secureTextEntry = false,
  keyboardType = 'default',
  textContentType,
  autoCapitalize = 'sentences',
  autoCorrect = true,
  maxLength,
  editable = true,
  autoComplete,
  multiline = false,
  error,
  returnKeyType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  textContentType?: TextInputProps['textContentType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoCorrect?: boolean;
  maxLength?: number;
  editable?: boolean;
  autoComplete?: TextInputProps['autoComplete'];
  multiline?: boolean;
  error?: string | undefined;
  returnKeyType?: TextInputProps['returnKeyType'];
}) {
  const { colors, scheme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const inputId = useId();
  const numeric = keyboardType === 'decimal-pad' || keyboardType === 'number-pad';
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputFrame, focused && styles.focused]}>
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={error}
          accessibilityState={{ disabled: !editable }}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          autoComplete={autoComplete}
          editable={editable}
          keyboardType={keyboardType}
          inputAccessoryViewID={Platform.OS === 'ios' && numeric ? inputId : undefined}
          selectTextOnFocus={numeric}
          keyboardAppearance={scheme}
          maxLength={maxLength}
          multiline={multiline}
          returnKeyType={returnKeyType}
          textAlignVertical={multiline ? 'top' : 'center'}
          onChangeText={onChangeText}
          onBlur={() => setFocused(false)}
          onFocus={() => setFocused(true)}
          secureTextEntry={secureTextEntry && !revealed}
          selectionColor={colors.primary}
          style={[
            styles.input,
            multiline ? { minHeight: 140 } : null,
            !editable && { opacity: 0.6 },
          ]}
          textContentType={textContentType}
          value={value}
        />
        {secureTextEntry ? (
          <Action
            label={`${revealed ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
            disabled={!editable}
            onPress={() => setRevealed(!revealed)}
            style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons
              name={revealed ? 'eye-off-outline' : 'eye-outline'}
              size={21}
              color={colors.muted}
              accessible={false}
            />
          </Action>
        ) : null}
      </View>
      {error ? (
        <Text
          accessibilityRole="alert"
          style={{ color: colors.error, fontSize: 14, lineHeight: 20 }}
        >
          {error}
        </Text>
      ) : null}
      {Platform.OS === 'ios' && numeric ? (
        <InputAccessoryView nativeID={inputId} backgroundColor={colors.surface}>
          <Action
            label="Done typing"
            onPress={Keyboard.dismiss}
            style={{
              minHeight: 48,
              alignItems: 'flex-end',
              justifyContent: 'center',
              paddingHorizontal: 20,
            }}
          >
            <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>Done</Text>
          </Action>
        </InputAccessoryView>
      ) : null}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    field: { gap: 8 },
    label: { color: colors.text, fontSize: 14, fontWeight: '600' },
    inputFrame: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 52,
      borderWidth: 1,
      borderColor: colors.outline,
      borderRadius: radii.input,
      backgroundColor: colors.surface,
    },
    input: {
      flex: 1,
      minWidth: 0,
      minHeight: 50,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: colors.text,
      fontSize: 16,
    },
    focused: { borderColor: colors.primary },
  });
