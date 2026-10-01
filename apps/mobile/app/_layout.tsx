import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SupabaseProvider } from '@/providers/supabase-provider';
import { colors } from '@/theme/tokens';

export default function RootLayout() {
  return (
    <SupabaseProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
      >
        <Stack.Screen name="(tabs)" />
      </Stack>
    </SupabaseProvider>
  );
}
