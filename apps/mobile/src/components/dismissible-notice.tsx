import { useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTheme } from '@/providers/theme-provider';
import { Action } from './primary-button';

export function DismissibleNotice({
  message,
  error = false,
}: {
  message: string;
  error?: boolean;
}) {
  // Keying the content resets the gesture and dismissal when a new message arrives.
  return <Message key={message} message={message} error={error} />;
}

function Message({ message, error }: { message: string; error: boolean }) {
  const { colors } = useTheme();
  const [dismissed, setDismissed] = useState(false);
  const reduced = useReducedMotion();
  const offset = useSharedValue(0);
  const dismiss = () => setDismissed(true);
  const gesture = Gesture.Pan()
    .activeOffsetX([-16, 16])
    .failOffsetY([-12, 12])
    .onUpdate((event) => {
      offset.set(event.translationX);
    })
    .onEnd((event) => {
      if (Math.abs(event.translationX) > 80 || Math.abs(event.velocityX) > 650) {
        const direction = Math.abs(event.velocityX) > 650 ? event.velocityX : event.translationX;
        offset.set(
          withTiming(direction < 0 ? -400 : 400, { duration: reduced ? 0 : 180 }, (finished) => {
            if (finished) scheduleOnRN(dismiss);
          }),
        );
      } else
        offset.set(
          reduced
            ? withTiming(0, { duration: 0 })
            : withSpring(0, { duration: 300, dampingRatio: 1 }),
        );
    })
    .onFinalize((_event, success) => {
      if (!success)
        offset.set(
          reduced
            ? withTiming(0, { duration: 0 })
            : withSpring(0, { duration: 300, dampingRatio: 1 }),
        );
    });
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.get() }],
    opacity: Math.max(0, 1 - Math.abs(offset.get()) / 300),
  }));
  if (dismissed) return null;
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            borderRadius: 16,
            paddingLeft: 16,
            backgroundColor: colors.surfaceSoft,
          },
          style,
        ]}
      >
        <View style={{ flex: 1, paddingVertical: 12 }}>
          <Text
            accessibilityRole={error ? 'alert' : 'text'}
            accessibilityLiveRegion="polite"
            style={{ color: error ? colors.danger : colors.text, fontSize: 15, lineHeight: 22 }}
          >
            {message}
          </Text>
        </View>
        <Action
          label="Dismiss message"
          onPress={dismiss}
          style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="close" size={20} color={colors.muted} accessible={false} />
        </Action>
      </Animated.View>
    </GestureDetector>
  );
}
