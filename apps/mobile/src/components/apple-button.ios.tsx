import { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { appleSignIn, type AppleAuthAdapter } from '@/lib/apple-auth';
import { PrimaryButton } from '@/components/primary-button';
import { Notice } from '@/components/screen';
import { useSupabase } from '@/providers/supabase-provider';
import { useTheme } from '@/providers/theme-provider';
import type { AppleButtonProps } from './apple-button';

const adapter: AppleAuthAdapter = {
  randomUUID: Crypto.randomUUID,
  sha256: (value) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value),
  authorize: async ({ nonce, state }) => {
    const credential = await AppleAuthentication.signInAsync({
      nonce,
      state,
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    return {
      identityToken: credential.identityToken,
      authorizationCode: credential.authorizationCode,
      state: credential.state,
      name: credential.fullName ? AppleAuthentication.formatFullName(credential.fullName) : null,
    };
  },
};

export function AppleButton({ disabled, busy, onSignIn }: AppleButtonProps) {
  const { client } = useSupabase();
  const { scheme, typography } = useTheme();
  const [availability, setAvailability] = useState<
    'checking' | 'available' | 'unavailable' | 'error'
  >('checking');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    void AppleAuthentication.isAvailableAsync().then(
      (value) => {
        if (current) setAvailability(value ? 'available' : 'unavailable');
      },
      () => {
        if (current) setAvailability('error');
      },
    );
    return () => {
      current = false;
    };
  }, [attempt]);
  if (!client) return null;
  if (availability === 'checking') return <Notice message="Checking Apple sign-in…" />;
  if (availability !== 'available') {
    const expoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
    const diagnostic = __DEV__
      ? `Apple native module: ${requireOptionalNativeModule<object>('ExpoAppleAuthentication') ? 'present' : 'missing'}\n` +
        `Runtime: ${Constants.executionEnvironment}; Expo Go: ${Constants.expoVersion ?? 'n/a'}; iOS: ${Platform.Version}`
      : null;
    return (
      <View style={{ gap: 8 }}>
        <Notice
          message={
            availability === 'error'
              ? 'Could not check Apple sign-in. Try again or use email.'
              : expoGo
                ? 'Apple sign-in is unavailable in this Expo Go session. Use email to continue.'
                : 'Apple sign-in is unavailable in this app. Use email to continue.'
          }
        />
        {__DEV__ && diagnostic ? (
          <Text selectable style={typography.body}>
            {diagnostic}
          </Text>
        ) : null}
        <PrimaryButton
          label="Check Apple sign-in again"
          variant="quiet"
          disabled={disabled}
          onPress={() => {
            setAvailability('checking');
            setAttempt((value) => value + 1);
          }}
        />
      </View>
    );
  }
  return (
    <View style={{ gap: 8 }} pointerEvents={disabled || busy ? 'none' : 'auto'}>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={
          scheme === 'dark'
            ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
            : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
        }
        cornerRadius={14}
        style={{ width: '100%', height: 52, opacity: disabled && !busy ? 0.5 : 1 }}
        accessibilityState={{ disabled: disabled || busy, busy }}
        onPress={() => {
          if (!disabled && !busy) onSignIn(() => appleSignIn(client, adapter));
        }}
      />
      {busy ? (
        <Text accessibilityLiveRegion="polite" style={typography.body}>
          Signing in with Apple…
        </Text>
      ) : null}
    </View>
  );
}
