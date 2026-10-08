import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  cubicBezier,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTheme } from '@/providers/theme-provider';
import { Action } from './primary-button';
import { NoticeContext } from './notice-context';

export function DismissibleNotice({
  message,
  error = false,
  host = false,
  onDismiss,
}: {
  message: string;
  error?: boolean;
  host?: boolean;
  onDismiss?: () => void;
}) {
  const show = useContext(NoticeContext);
  const id = useId();
  useEffect(() => {
    if (show && !host) show({ id, message, error });
  }, [show, host, id, message, error]);
  if (show && !host) return null;
  // Keying the content resets the gesture and dismissal when a new message arrives.
  return (
    <Message key={message} message={message} error={error} floating={host} onDismiss={onDismiss} />
  );
}

function Message({
  message,
  error,
  floating,
  onDismiss,
}: {
  message: string;
  error: boolean;
  floating: boolean;
  onDismiss: (() => void) | undefined;
}) {
  const { colors } = useTheme();
  const [dismissed, setDismissed] = useState(false);
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const offset = useSharedValue(0);
  const origin = useSharedValue(0);
  const dismissCallback = useRef(onDismiss);
  useLayoutEffect(() => {
    dismissCallback.current = onDismiss;
  }, [onDismiss]);
  const dismiss = useCallback(() => {
    setDismissed(true);
    dismissCallback.current?.();
  }, []);
  useEffect(() => {
    if (!floating || error) return;
    const timer = setTimeout(dismiss, 8000);
    return () => clearTimeout(timer);
  }, [floating, error, dismiss]);
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-16, 16])
        .failOffsetY([-12, 12])
        .onStart(() => {
          cancelAnimation(offset);
          origin.set(offset.get());
        })
        .onUpdate((event) => {
          if (!reduced) offset.set(origin.get() + event.translationX);
        })
        // eslint-disable-next-line react-hooks/refs -- Gesture Handler registers this callback; dismissal reads the latest handler only after a gesture, never during render.
        .onEnd((event) => {
          if (Math.abs(event.translationX) > 80 || Math.abs(event.velocityX) > 650) {
            if (reduced) {
              scheduleOnRN(dismiss);
              return;
            }
            const direction =
              Math.abs(event.velocityX) > 650 ? event.velocityX : event.translationX;
            offset.set(
              withSpring(
                direction < 0 ? -width : width,
                {
                  duration: 300,
                  dampingRatio: 1,
                  velocity: event.velocityX,
                  overshootClamping: true,
                },
                (finished) => {
                  if (finished) scheduleOnRN(dismiss);
                },
              ),
            );
          } else
            offset.set(
              reduced
                ? withTiming(0, { duration: 0 })
                : withSpring(0, { duration: 300, dampingRatio: 1, velocity: event.velocityX }),
            );
        })
        .onFinalize((_event, success) => {
          if (!success)
            offset.set(
              reduced
                ? withTiming(0, { duration: 0 })
                : withSpring(0, { duration: 300, dampingRatio: 1 }),
            );
        }),
    [offset, origin, reduced, dismiss, width],
  );
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: reduced ? 0 : offset.get() }],
    opacity: Math.max(0, 1 - Math.abs(offset.get()) / 300),
  }));
  if (dismissed) return null;
  return (
    <Animated.View
      style={
        floating
          ? {
              animationName: {
                from: { opacity: 0, transform: [{ translateY: reduced ? 0 : -12 }] },
                to: { opacity: 1, transform: [{ translateY: 0 }] },
              },
              animationDuration: reduced ? 100 : 180,
              animationTimingFunction: cubicBezier(0.23, 1, 0.32, 1),
            }
          : undefined
      }
    >
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              borderRadius: 16,
              paddingLeft: 16,
              backgroundColor: colors.surfaceRaised,
              borderWidth: 0.5,
              borderColor: colors.border,
              shadowColor: '#000',
              shadowOpacity: 0.18,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 5 },
              elevation: 8,
            },
            style,
          ]}
        >
          <View style={{ flex: 1, paddingVertical: 12 }}>
            <Text
              accessibilityRole={error ? 'alert' : 'text'}
              accessibilityLiveRegion="polite"
              style={{ color: error ? colors.error : colors.text, fontSize: 15, lineHeight: 22 }}
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
    </Animated.View>
  );
}
