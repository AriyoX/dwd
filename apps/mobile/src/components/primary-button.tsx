import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors, radii } from '@/theme/tokens';

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  busy = false,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && styles.secondary,
        pressed &&
          !disabled &&
          (variant === 'secondary' ? styles.secondaryPressed : styles.pressed),
        (disabled || busy) && styles.disabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={variant === 'secondary' ? colors.primary : colors.white} />
      ) : (
        <Text style={[styles.label, variant === 'secondary' && styles.secondaryLabel]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: radii.control,
    backgroundColor: colors.primary,
  },
  label: { color: colors.white, fontSize: 15, fontWeight: '600', textAlign: 'center' },
  secondary: { backgroundColor: colors.surface, borderColor: colors.border },
  secondaryLabel: { color: colors.text },
  secondaryPressed: { backgroundColor: colors.surfaceSoft },
  pressed: { backgroundColor: colors.primaryHover, opacity: 0.92 },
  disabled: { opacity: 0.55 },
});
