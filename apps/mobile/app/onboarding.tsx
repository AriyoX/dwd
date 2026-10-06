import { useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { Easing, FadeIn, useReducedMotion } from 'react-native-reanimated';
import { AuthHeader, LegalLinks } from '@/components/auth-chrome';
import { OnboardingArtwork } from '@/components/onboarding-artwork';
import { Action, PrimaryButton } from '@/components/primary-button';
import { Screen } from '@/components/screen';
import { useOnboarding } from '@/providers/onboarding-provider';
import { useTheme } from '@/providers/theme-provider';

const steps = [
  {
    title: 'Make room\nfor the night.',
    copy: 'Choose your drinks and an end time before you start.',
  },
  {
    title: 'Your night.\nYour pace.',
    copy: 'Log drinks and chasers as you go. Counts show what you logged, never a target.',
  },
  {
    title: 'Stay in\ngood company.',
    copy: 'Start solo or invite friends. People in your night can see your shared activity.',
  },
] as const;
const entrance = FadeIn.duration(180).easing(Easing.bezier(0.23, 1, 0.32, 1));

export default function OnboardingScreen() {
  const [step, setStep] = useState(0);
  const { complete } = useOnboarding();
  const { colors, typography } = useTheme();
  const { width, height, fontScale } = useWindowDimensions();
  const reduced = useReducedMotion();
  const router = useRouter();
  const current = steps[step] ?? steps[0];
  const last = step === steps.length - 1;
  function finish(destination: '/welcome' | '/auth/sign-in' | '/auth/sign-up') {
    complete();
    router.replace(destination);
  }
  return (
    <Screen
      contentStyle={{ paddingBottom: 20, gap: 16 }}
      footer={
        <View style={{ gap: 8 }}>
          <PrimaryButton
            label={last ? 'Create account' : 'Next'}
            icon={last ? 'person-add-outline' : 'arrow-forward'}
            onPress={() => (last ? finish('/auth/sign-up') : setStep(step + 1))}
          />
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Action
              label={step > 0 ? 'Previous step' : 'Sign in'}
              onPress={() => (step > 0 ? setStep(step - 1) : finish('/auth/sign-in'))}
              style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 8 }}
            >
              <Text style={{ color: colors.primary, fontSize: 15, fontWeight: '600' }}>
                {step > 0 ? 'Back' : 'Sign in'}
              </Text>
            </Action>
            {last ? (
              <Action
                label="Sign in"
                onPress={() => finish('/auth/sign-in')}
                style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 8 }}
              >
                <Text style={{ color: colors.primary, fontSize: 15, fontWeight: '600' }}>
                  Sign in
                </Text>
              </Action>
            ) : (
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                {String(step + 1).padStart(2, '0')} / 03
              </Text>
            )}
          </View>
        </View>
      }
    >
      <AuthHeader />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Introduction"
          accessibilityValue={{
            min: 1,
            max: steps.length,
            now: step + 1,
            text: `Step ${step + 1} of ${steps.length}`,
          }}
          style={{ flexDirection: 'row', gap: 6 }}
        >
          {steps.map((_, index) => (
            <View
              key={index}
              style={{
                width: 28,
                height: 4,
                borderRadius: 2,
                backgroundColor: index === step ? colors.primary : colors.border,
              }}
            />
          ))}
        </View>
        <Action
          label="Skip introduction"
          onPress={() => finish('/welcome')}
          style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 8 }}
        >
          <Text style={{ color: colors.muted, fontSize: 15 }}>Skip</Text>
        </Action>
      </View>
      <Animated.View key={step} {...(reduced ? {} : { entering: entrance })} style={{ gap: 20 }}>
        <OnboardingArtwork scene={step} height={Math.min(width * 0.62, height * 0.3, 250)} />
        <Text
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
          style={{
            ...typography.heading,
            fontSize: width < 360 ? 36 : 42,
            lineHeight: width < 360 ? 42 : 47,
            letterSpacing: -1.5,
          }}
        >
          {fontScale > 1.3 ? current.title.replace('\n', ' ') : current.title}
        </Text>
        <Text style={{ ...typography.body, color: colors.muted }}>{current.copy}</Text>
      </Animated.View>
      {last ? (
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
          DWD cannot determine sobriety or driving safety.
        </Text>
      ) : null}
      <LegalLinks />
    </Screen>
  );
}
