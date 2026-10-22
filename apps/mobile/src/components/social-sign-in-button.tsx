import type { ReactNode } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Action } from './primary-button';

// The official Apple medium artwork has a 19pt glyph in a 44pt canvas.
// Keep that canvas intact and match Google's visible glyph height to it.
export const SOCIAL_BUTTON_HEIGHT = 48;
export const SOCIAL_LOGO_SIZE = (19 / 44) * SOCIAL_BUTTON_HEIGHT;
export const APPLE_LOGO_WIDTH = (31 / 44) * SOCIAL_BUTTON_HEIGHT;

export function SocialSignInButton({
  provider,
  icon,
  onPress,
  disabled,
  busy = false,
  dark = false,
}: {
  provider: 'Apple' | 'Google';
  icon: ReactNode;
  onPress: () => void;
  disabled: boolean;
  busy?: boolean;
  dark?: boolean;
}) {
  const foreground = dark ? '#FFFFFF' : provider === 'Apple' ? '#000000' : '#1F1F1F';
  return (
    <Action
      label={busy ? `Connecting to ${provider}` : `Continue with ${provider}`}
      disabled={disabled || busy}
      busy={busy}
      onPress={() => {
        if (!disabled && !busy) onPress();
      }}
      style={{
        minHeight: SOCIAL_BUTTON_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingHorizontal: 16,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: provider === 'Google' ? '#747775' : dark ? '#000000' : '#FFFFFF',
        backgroundColor: dark ? '#000000' : '#FFFFFF',
      }}
    >
      {busy ? (
        <ActivityIndicator accessibilityLabel={`Connecting to ${provider}`} color={foreground} />
      ) : (
        <>
          <View
            style={{
              width: APPLE_LOGO_WIDTH,
              height: SOCIAL_BUTTON_HEIGHT,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            accessible={false}
          >
            {icon}
          </View>
          <Text
            style={{
              color: foreground,
              fontSize: 17,
              lineHeight: 22,
              fontWeight: '500',
              flexShrink: 1,
              textAlign: 'center',
            }}
          >
            Continue with {provider}
          </Text>
        </>
      )}
    </Action>
  );
}
