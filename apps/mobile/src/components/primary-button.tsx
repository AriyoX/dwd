import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { cubicBezier, useReducedMotion } from 'react-native-reanimated';
import { useTheme } from '@/providers/theme-provider';
import { radii } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';

export function Action({
  children,
  onPress,
  label,
  disabled = false,
  selected,
  style,
}: {
  children: ReactNode;
  onPress: () => void;
  label: string;
  disabled?: boolean;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [pressed, setPressed] = useState(false);
  const reduced = useReducedMotion();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, ...(selected === undefined ? {} : { selected }) }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      pressRetentionOffset={16}
      hitSlop={4}
    >
      <Animated.View
        style={[
          style,
          {
            opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
            transform: [{ scale: pressed && !reduced ? 0.97 : 1 }],
            transitionProperty: ['transform', 'opacity'],
            transitionDuration: reduced ? 0 : 120,
            transitionTimingFunction: cubicBezier(0.23, 1, 0.32, 1),
          },
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}
export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  busy = false,
  variant = 'primary',
  icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: 'primary' | 'secondary' | 'water' | 'quiet' | 'danger';
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}) {
  const { colors } = useTheme();
  const foreground =
    variant === 'primary'
      ? colors.onPrimary
      : variant === 'water'
        ? colors.waterText
        : variant === 'danger'
          ? colors.danger
          : variant === 'quiet'
            ? colors.primary
            : colors.text;
  return (
    <Action
      label={busy ? `${label}, saving` : label}
      disabled={disabled || busy}
      onPress={onPress}
      style={{
        minHeight: 52,
        flexDirection: 'row',
        gap: 10,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 18,
        paddingVertical: 14,
        borderRadius: radii.control,
        borderWidth: 1,
        borderColor: variant === 'secondary' ? colors.border : 'transparent',
        backgroundColor:
          variant === 'primary'
            ? colors.primary
            : variant === 'water'
              ? colors.waterSoft
              : variant === 'quiet'
                ? 'transparent'
                : colors.surface,
      }}
    >
      {busy ? (
        <ActivityIndicator accessibilityLabel="Saving" color={foreground} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={20} color={foreground} accessible={false} /> : null}
          <Text
            style={{
              color: foreground,
              fontSize: 16,
              fontWeight: '600',
              textAlign: 'center',
              flexShrink: 1,
            }}
          >
            {label}
          </Text>
        </>
      )}
    </Action>
  );
}
