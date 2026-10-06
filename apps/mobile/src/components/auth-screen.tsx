import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Choice } from '@/components/choice';
import { Action, PrimaryButton } from '@/components/primary-button';
import { AuthHeader, LegalLinks } from '@/components/auth-chrome';
import { GoogleButton } from '@/components/google-button';
import { AppleButton } from '@/components/apple-button';
import { Ionicons } from '@expo/vector-icons';
import { LoadingPanel, Notice, Panel, Screen, ScreenHeading } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { authCallbackUrl, authHandoff } from '@/lib/auth-state';
import { authRoutes, type AuthMode } from '@/lib/auth-routing';
import {
  AuthFlowError,
  confirmCode,
  emailSignIn,
  emailSignUp,
  finishProfile,
  googleSignIn,
  requestRecovery,
  resendConfirmation,
  resetPassword,
  signOutAuth,
} from '@/lib/auth-actions';
import { useSupabase } from '@/providers/supabase-provider';
import { useTheme } from '@/providers/theme-provider';

WebBrowser.maybeCompleteAuthSession();
const headings: Record<AuthMode, string> = {
  login: 'Welcome back.',
  signup: 'Create your\naccount.',
  confirm: 'Confirm your email',
  recover: 'Reset password',
  reset: 'Choose a new password',
  complete: 'Finish your account',
};

export function AuthScreen({ mode }: { mode: AuthMode }) {
  const { next, updated } = useLocalSearchParams<{ next?: string; updated?: string }>();
  const { session } = useSupabase();
  return (
    <AuthForm
      key={`${mode}:${session?.user.id ?? 'anonymous'}`}
      mode={mode}
      next={next}
      updated={updated === '1'}
    />
  );
}

function AuthForm({
  mode,
  next,
  updated,
}: {
  mode: AuthMode;
  next: string | undefined;
  updated: boolean;
}) {
  const router = useRouter();
  const {
    client,
    session,
    status,
    issue: sessionIssue,
    profileStatus,
    refreshProfile,
    recovering,
    markRecovery,
  } = useSupabase();
  const { colors, typography } = useTheme();
  const handoff = authHandoff();
  const [email, setEmail] = useState(() => handoff.read().email);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [editedName, setName] = useState<string | null>(null);
  const suggestedName: unknown =
    session?.user.user_metadata['display_name'] ?? session?.user.user_metadata['full_name'];
  const name = editedName ?? (typeof suggestedName === 'string' ? suggestedName.slice(0, 60) : '');
  const [adult, setAdult] = useState(false);
  const [code, setCode] = useState('');
  const [busyAction, setBusyAction] = useState<
    'email' | 'google' | 'apple' | 'resend' | 'signout' | null
  >(null);
  const busy = busyAction !== null;
  const [issue, setIssue] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(
    updated ? 'Password updated. Sign in with your new password.' : null,
  );
  const [clock, setClock] = useState(Date.now);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const callback = (recovery = false) =>
    authCallbackUrl(handoff.read().next, recovery ? 'recovery' : 'signup');
  const switchMode = (target: AuthMode) => router.replace(authRoutes[target]);
  useEffect(() => {
    mounted.current = true;
    if (next) authHandoff().remember(next);
    return () => {
      mounted.current = false;
    };
  }, [next]);
  useEffect(() => {
    if (mode !== 'confirm') return;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [mode]);
  async function run(
    action: () => Promise<void>,
    source: NonNullable<typeof busyAction> = 'email',
  ) {
    if (!client || inFlight.current) return;
    inFlight.current = true;
    setBusyAction(source);
    setIssue(null);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      if (mounted.current)
        setIssue(
          error instanceof AuthFlowError ? error.message : 'Could not connect. Please try again.',
        );
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setBusyAction(null);
        setClock(Date.now());
      }
    }
  }
  async function submit() {
    if (!client) return;
    switch (mode) {
      case 'login':
        if ((await emailSignIn(client, email, password, handoff)) === 'confirm')
          switchMode('confirm');
        break;
      case 'signup':
        if (
          (await emailSignUp(
            client,
            { email, password, displayName: name, ageConfirmed: adult },
            callback(),
            handoff,
          )) === 'confirm'
        )
          switchMode('confirm');
        break;
      case 'confirm':
        await confirmCode(client, email, code);
        break;
      case 'recover':
        setMessage(await requestRecovery(client, email, callback(true)));
        break;
      case 'complete':
        await finishProfile(client, name, adult);
        refreshProfile();
        break;
      case 'reset':
        if (!recovering || !session)
          throw new AuthFlowError('Open your reset email on this device, or request a new link.');
        if (password !== repeat) throw new AuthFlowError('Passwords do not match.');
        await resetPassword(client, password);
        if (!mounted.current) return;
        setPasswordSaved(true);
        setPassword('');
        setRepeat('');
        await leaveRecovery(true);
        break;
    }
  }
  async function leaveRecovery(updatedPassword = false) {
    if (!client) return;
    await signOutAuth(client);
    markRecovery(null);
    handoff.clear();
    router.replace(updatedPassword ? '/auth/sign-in?updated=1' : '/auth/sign-in');
  }
  async function google() {
    if (!client) return;
    const destination = await googleSignIn(
      client,
      authCallbackUrl(handoff.read().next, 'google'),
      WebBrowser.openAuthSessionAsync,
      Constants.executionEnvironment === ExecutionEnvironment.StoreClient,
    );
    if (!mounted.current) return;
    if (destination) router.replace(destination as Href);
    else setMessage('Google sign-in did not finish in this app. Try again or use email.');
  }
  const confirmation = handoff.read();
  const countdown =
    confirmation.email === email.trim().toLowerCase()
      ? Math.max(0, Math.ceil((confirmation.retryAt - clock) / 1000))
      : 0;
  const profilePending = session && mode !== 'reset' && profileStatus === 'loading';
  const showEmail = ['login', 'signup', 'confirm', 'recover'].includes(mode);
  const showPassword = ['login', 'signup', 'reset'].includes(mode);
  const labels: Record<AuthMode, string> = {
    login: 'Sign in',
    signup: 'Create account',
    confirm: 'Confirm email',
    recover: 'Send reset link',
    reset: 'Update password',
    complete: 'Continue',
  };
  const busyLabels: Record<AuthMode, string> = {
    login: 'Signing in',
    signup: 'Creating account',
    confirm: 'Confirming email',
    recover: 'Sending reset link',
    reset: 'Updating password',
    complete: 'Saving your account',
  };
  return (
    <Screen contentStyle={{ gap: 28, paddingBottom: 24 }}>
      <AuthHeader back={mode !== 'reset' && mode !== 'complete'} disabled={busy} />
      <ScreenHeading
        title={headings[mode]}
        leading={
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: mode === 'signup' ? 22 : 32,
              backgroundColor:
                mode === 'recover' || mode === 'reset' ? colors.waterSoft : colors.primarySoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            accessible={false}
          >
            <Ionicons
              name={
                mode === 'login'
                  ? 'moon-outline'
                  : mode === 'signup'
                    ? 'person-add-outline'
                    : mode === 'confirm'
                      ? 'mail-open-outline'
                      : mode === 'complete'
                        ? 'person-outline'
                        : 'key-outline'
              }
              size={28}
              color={mode === 'recover' || mode === 'reset' ? colors.waterText : colors.primary}
            />
          </View>
        }
      />
      {status === 'unconfigured' ? (
        <Notice error message="Account connection unavailable." />
      ) : status === 'loading' || profilePending ? (
        <LoadingPanel />
      ) : mode === 'reset' && passwordSaved ? (
        <View style={{ gap: 20 }}>
          <Text accessibilityLiveRegion="polite" style={typography.body}>
            Password updated. Sign out to finish, then sign in with your new password.
          </Text>
          {issue ? <Notice error message={issue} /> : null}
          <PrimaryButton
            label="Sign out and continue"
            busy={busy}
            busyLabel="Signing out"
            onPress={() => void run(() => leaveRecovery(true), 'signout')}
          />
        </View>
      ) : mode === 'reset' && !recovering ? (
        <View style={{ gap: 20 }}>
          <Notice
            error
            message="Open your reset email on this device. If the link expired, request a new one."
          />
          <PrimaryButton label="Request a new reset link" onPress={() => switchMode('recover')} />
          <PrimaryButton
            label="Back to sign in"
            variant="quiet"
            onPress={() => switchMode('login')}
          />
        </View>
      ) : session && profileStatus === 'error' && mode !== 'reset' ? (
        <Panel>
          <Notice error message="Could not load your account." />
          <PrimaryButton label="Retry" variant="secondary" onPress={refreshProfile} />
          <PrimaryButton
            label="Sign out"
            variant="quiet"
            disabled={busy}
            onPress={() =>
              void run(async () => {
                if (!client) return;
                const result = await client.auth.signOut();
                if (result.error) throw new AuthFlowError('Could not sign out. Retry.');
                handoff.clear();
              })
            }
          />
          {issue ? <Notice error message={issue} /> : null}
        </Panel>
      ) : (
        <View style={{ gap: 20 }}>
          {sessionIssue ? <Notice error message={sessionIssue} /> : null}
          {handoff.read().next.startsWith('/join?') ? (
            <Notice message="Sign in or create an account to continue your invitation." />
          ) : null}
          {mode === 'login' || mode === 'signup' ? (
            <>
              <GoogleButton
                disabled={busy}
                busy={busyAction === 'google'}
                onPress={() => void run(google, 'google')}
              />
              <AppleButton
                disabled={busy}
                busy={busyAction === 'apple'}
                onSignIn={(authenticate) =>
                  void run(async () => {
                    const signedIn = await authenticate();
                    if (mounted.current && !signedIn)
                      setMessage('Apple sign-in was cancelled. You can try again or use email.');
                  }, 'apple')
                }
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1, height: 0.5, backgroundColor: colors.border }} />
                <Text style={{ color: colors.muted, fontSize: 13 }}>or use email</Text>
                <View style={{ flex: 1, height: 0.5, backgroundColor: colors.border }} />
              </View>
            </>
          ) : null}
          {mode === 'confirm' ? (
            <Notice message="Open the latest confirmation email on this device, or enter its code. If you confirmed on another device, sign in here." />
          ) : null}
          {showEmail ? (
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              maxLength={254}
              editable={!busy}
            />
          ) : null}
          {mode === 'signup' || mode === 'complete' ? (
            <TextField
              label="Display name"
              value={name}
              onChangeText={setName}
              textContentType="name"
              autoComplete="name"
              maxLength={60}
              editable={!busy}
            />
          ) : null}
          {showPassword ? (
            <TextField
              label={mode === 'reset' ? 'New password' : 'Password'}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType={mode === 'login' ? 'password' : 'newPassword'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              maxLength={128}
              editable={!busy}
            />
          ) : null}
          {mode === 'login' ? (
            <View style={{ alignItems: 'flex-end', marginTop: -12 }}>
              <Action
                label="Forgot password?"
                disabled={busy}
                onPress={() => switchMode('recover')}
                style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 4 }}
              >
                <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '600' }}>
                  Forgot password?
                </Text>
              </Action>
            </View>
          ) : null}
          {mode === 'reset' ? (
            <TextField
              label="Confirm new password"
              value={repeat}
              onChangeText={setRepeat}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
              autoComplete="new-password"
              maxLength={128}
              editable={!busy}
            />
          ) : null}
          {mode === 'signup' || mode === 'reset' ? (
            <Notice message="Use at least 8 characters for your password." />
          ) : null}
          {mode === 'confirm' ? (
            <TextField
              label="Confirmation code"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={10}
              editable={!busy}
            />
          ) : null}
          {mode === 'signup' || mode === 'complete' ? (
            <>
              <Choice
                label="I am 18 or older, meet the local legal drinking age, and agree to the Terms."
                selected={adult}
                disabled={busy}
                onPress={() => setAdult(!adult)}
              />
              <Notice message="By continuing, you agree to the Terms and acknowledge the Privacy notice." />
            </>
          ) : null}
          {issue ? <Notice error message={issue} /> : null}
          {message ? (
            <Text accessibilityLiveRegion="polite" style={typography.body}>
              {message}
            </Text>
          ) : null}
          <PrimaryButton
            label={labels[mode]}
            busy={busyAction === 'email'}
            busyLabel={busyLabels[mode]}
            disabled={busy || ((mode === 'signup' || mode === 'complete') && !adult)}
            onPress={() => void run(submit)}
          />
          {mode === 'login' || mode === 'signup' ? (
            <PrimaryButton
              label={mode === 'login' ? 'Create account' : 'Sign in'}
              variant="quiet"
              disabled={busy}
              onPress={() => switchMode(mode === 'login' ? 'signup' : 'login')}
            />
          ) : null}
          {mode === 'confirm' ? (
            <PrimaryButton
              label={countdown ? `Resend in ${countdown}s` : 'Resend confirmation'}
              variant="secondary"
              disabled={busy || countdown > 0}
              busy={busyAction === 'resend'}
              busyLabel="Sending confirmation"
              onPress={() =>
                void run(async () => {
                  if (client)
                    setMessage(await resendConfirmation(client, email, callback(), handoff));
                }, 'resend')
              }
            />
          ) : null}
          {mode === 'reset' && recovering ? (
            <PrimaryButton
              label="Cancel and sign out"
              variant="quiet"
              disabled={busy}
              busy={busyAction === 'signout'}
              busyLabel="Signing out"
              onPress={() => void run(() => leaveRecovery(), 'signout')}
            />
          ) : null}
          {mode === 'confirm' || mode === 'recover' ? (
            <PrimaryButton
              label="Back to sign in"
              variant="quiet"
              disabled={busy}
              onPress={() => switchMode('login')}
            />
          ) : null}
          {mode === 'complete' ? (
            <PrimaryButton
              label="Sign out"
              variant="quiet"
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  if (client) {
                    const result = await client.auth.signOut();
                    if (result.error) throw new AuthFlowError('Could not sign out. Retry.');
                    handoff.clear();
                    switchMode('login');
                  }
                })
              }
            />
          ) : null}
        </View>
      )}
      {mode === 'complete' && session ? (
        <PrimaryButton
          label="Delete this account"
          variant="quiet"
          disabled={busy}
          onPress={() => router.push('/delete-account')}
        />
      ) : null}
      <LegalLinks />
    </Screen>
  );
}
