import {
  Stack,
  ThemeProvider as NavigationThemeProvider,
  DarkTheme,
  DefaultTheme,
  useRouter,
} from 'expo-router';
import { Text } from 'react-native';
import { Action } from '@/components/primary-button';
import { StatusBar } from 'expo-status-bar';
import { useReducedMotion } from 'react-native-reanimated';
import { SupabaseProvider, useSupabase } from '@/providers/supabase-provider';
import { ThemeProvider, useTheme } from '@/providers/theme-provider';
import { AuthNavigation } from '@/components/auth-navigation';
import { OnboardingProvider } from '@/providers/onboarding-provider';
import { OfflineProvider } from '@/providers/offline-provider';
import { NotificationsProvider } from '@/providers/notifications-provider';
import { LocationProvider } from '@/providers/location-provider';
import { ConnectivityProvider } from '@/providers/connectivity-provider';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { TourNavigation } from '@/components/tour-navigation';
import { PermissionsProvider } from '@/providers/permissions-provider';
import { FeatureTourProvider } from '@/providers/feature-tour-provider';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <SupabaseProvider>
          <ConnectivityProvider>
            <OfflineProvider>
              <OnboardingProvider>
                <NotificationsProvider>
                  <LocationProvider>
                    <PermissionsProvider>
                      <Navigation />
                    </PermissionsProvider>
                  </LocationProvider>
                </NotificationsProvider>
              </OnboardingProvider>
            </OfflineProvider>
          </ConnectivityProvider>
        </SupabaseProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

function Navigation() {
  const router = useRouter();
  const { access, session } = useSupabase();
  const { colors, scheme } = useTheme();
  const reduced = useReducedMotion();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const sheet = {
    presentation: 'formSheet' as const,
    sheetAllowedDetents: [1],
    sheetGrabberVisible: true,
    sheetCornerRadius: 28,
    headerShown: true,
    headerRight: () => (
      <Action
        label="Cancel"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 8 }}
      >
        <Text style={{ color: colors.primary, fontSize: 17 }}>Cancel</Text>
      </Action>
    ),
  };
  return (
    <NavigationThemeProvider
      value={{
        ...base,
        colors: {
          ...base.colors,
          background: colors.background,
          card: colors.surface,
          text: colors.text,
          primary: colors.primary,
          border: colors.border,
        },
      }}
    >
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <AuthNavigation />
      <FeatureTourProvider key={session?.user.id ?? 'signed-out'}>
        <TourNavigation />
        <Stack
          screenOptions={{
            headerTintColor: colors.primary,
            headerStyle: { backgroundColor: colors.background },
            headerShadowVisible: false,
            headerBackButtonDisplayMode: 'minimal',
            contentStyle: { backgroundColor: colors.background },
            ...(reduced ? { animation: 'fade' } : {}),
          }}
        >
          <Stack.Screen name="welcome" options={{ headerShown: false, animation: 'fade' }} />
          <Stack.Protected guard={access !== 'ready'}>
            <Stack.Screen name="onboarding" options={{ headerShown: false }} />
            <Stack.Screen name="auth/index" options={{ headerShown: false }} />
            <Stack.Screen name="auth/sign-in" options={{ headerShown: false }} />
            <Stack.Screen name="auth/sign-up" options={{ headerShown: false }} />
            <Stack.Screen name="auth/confirm" options={{ headerShown: false }} />
            <Stack.Screen name="auth/forgot-password" options={{ headerShown: false }} />
            <Stack.Screen name="auth/reset-password" options={{ headerShown: false }} />
            <Stack.Screen name="auth/complete-profile" options={{ headerShown: false }} />
          </Stack.Protected>
          <Stack.Screen name="auth/callback" options={{ title: 'Confirm account' }} />
          <Stack.Screen name="legal" options={{ title: 'DWD' }} />
          <Stack.Protected guard={access === 'ready' || access === 'profile'}>
            <Stack.Screen name="delete-account" options={{ title: 'Delete account' }} />
          </Stack.Protected>
          <Stack.Protected guard={access === 'ready'}>
            <Stack.Screen name="tour" options={{ title: 'Explore DWD' }} />
            <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
            <Stack.Screen name="profile" options={{ ...sheet, title: 'Edit profile' }} />
            <Stack.Screen name="support" options={{ title: 'Support & feedback' }} />
            <Stack.Screen name="reminders" options={{ ...sheet, title: 'Reminders' }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="night/new" options={{ title: 'Start a night' }} />
            <Stack.Screen name="join" options={{ ...sheet, title: 'Join a night' }} />
            <Stack.Screen name="night/[nightId]/index" options={{ title: 'Tonight' }} />
            <Stack.Screen name="night/[nightId]/report" options={{ title: 'Report or block' }} />
            <Stack.Screen name="night/[nightId]/log" options={{ ...sheet, title: 'Log drink' }} />
            <Stack.Screen
              name="night/[nightId]/catch-up"
              options={{ ...sheet, title: 'Add missed entries' }}
            />
            <Stack.Screen
              name="night/[nightId]/planned-end"
              options={{ ...sheet, title: 'Night check-in' }}
            />
            <Stack.Screen
              name="night/[nightId]/invite"
              options={{ ...sheet, title: 'Invite friends' }}
            />
            <Stack.Screen name="night/[nightId]/plan" options={{ ...sheet, title: 'Your plan' }} />
            <Stack.Screen
              name="night/[nightId]/guest"
              options={{ ...sheet, title: 'Add person' }}
            />
            <Stack.Screen
              name="night/[nightId]/bottles"
              options={{ ...sheet, title: 'Shared bottles' }}
            />
            <Stack.Screen
              name="night/[nightId]/reminders"
              options={{ ...sheet, title: 'Reminders' }}
            />
            <Stack.Screen
              name="night/[nightId]/help"
              options={{
                ...sheet,
                title: 'Get help',
                headerRight: () => (
                  <Action
                    label="Done"
                    onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
                    style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 8 }}
                  >
                    <Text style={{ color: colors.primary, fontSize: 17 }}>Done</Text>
                  </Action>
                ),
              }}
            />
            <Stack.Screen name="night/[nightId]/summary" options={{ title: 'Night recap' }} />
            <Stack.Screen name="night/[nightId]/photos" options={{ title: 'Photo memories' }} />
          </Stack.Protected>
        </Stack>
      </FeatureTourProvider>
    </NavigationThemeProvider>
  );
}
