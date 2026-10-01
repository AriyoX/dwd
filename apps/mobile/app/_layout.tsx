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
import { SupabaseProvider } from '@/providers/supabase-provider';
import { ThemeProvider, useTheme } from '@/providers/theme-provider';

export default function RootLayout() {
  return (
    <ThemeProvider>
      <SupabaseProvider>
        <Navigation />
      </SupabaseProvider>
    </ThemeProvider>
  );
}

function Navigation() {
  const router = useRouter();
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
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="night/new" options={{ title: 'Start a night' }} />
        <Stack.Screen name="join" options={{ ...sheet, title: 'Join a night' }} />
        <Stack.Screen name="night/[nightId]/index" options={{ title: 'Tonight' }} />
        <Stack.Screen name="night/[nightId]/log" options={{ ...sheet, title: 'Log a drink' }} />
        <Stack.Screen name="night/[nightId]/plan" options={{ ...sheet, title: 'Your plan' }} />
        <Stack.Screen name="night/[nightId]/summary" options={{ title: 'Night recap' }} />
      </Stack>
    </NavigationThemeProvider>
  );
}
