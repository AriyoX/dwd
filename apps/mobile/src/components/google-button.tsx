import { ActivityIndicator, Image, Text } from 'react-native';
import { Action } from '@/components/primary-button';
// Current, unmodified Google asset: https://developers.google.com/identity/branding-guidelines
import googleLogo from '../../assets/google-g.png';

export function GoogleButton({
  onPress,
  disabled,
  busy = false,
}: {
  onPress: () => void;
  disabled: boolean;
  busy?: boolean;
}) {
  return (
    <Action
      label={busy ? 'Connecting to Google' : 'Continue with Google'}
      disabled={disabled || busy}
      onPress={onPress}
      style={{
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#747775',
        backgroundColor: '#FFFFFF',
      }}
    >
      {busy ? (
        <ActivityIndicator accessibilityLabel="Connecting to Google" color="#1F1F1F" />
      ) : (
        <>
          <Image
            alt=""
            source={googleLogo}
            style={{ width: 20, height: 20 }}
            resizeMode="contain"
            accessible={false}
          />
          <Text
            style={{
              color: '#1F1F1F',
              fontSize: 16,
              fontWeight: '500',
              flexShrink: 1,
              textAlign: 'center',
            }}
          >
            Continue with Google
          </Text>
        </>
      )}
    </Action>
  );
}
