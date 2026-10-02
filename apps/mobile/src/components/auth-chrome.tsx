import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Brand } from '@/components/brand';
import { Action } from '@/components/primary-button';
import { useTheme } from '@/providers/theme-provider';

export function AuthHeader({
  back = false,
  disabled = false,
}: {
  back?: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  const { colors, preference, setPreference } = useTheme();
  const next = preference === 'system' ? 'light' : preference === 'light' ? 'dark' : 'system';
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {back ? (
          <Action
            label="Back"
            disabled={disabled}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/welcome'))}
            style={{
              minWidth: 48,
              minHeight: 48,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 24,
              backgroundColor: colors.surfaceSoft,
            }}
          >
            <Ionicons name="arrow-back" size={22} color={colors.primary} accessible={false} />
          </Action>
        ) : null}
        <Brand />
      </View>
      <Action
        label={`Appearance: ${preference}. Use ${next} appearance.`}
        onPress={() => setPreference(next)}
        style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons
          name={
            preference === 'dark'
              ? 'moon-outline'
              : preference === 'light'
                ? 'sunny-outline'
                : 'contrast-outline'
          }
          size={22}
          color={colors.muted}
          accessible={false}
        />
      </Action>
    </View>
  );
}

export function LegalLinks() {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        flexWrap: 'wrap',
        gap: 16,
      }}
    >
      <Text style={{ color: colors.muted, fontSize: 13 }}>For adults 18+</Text>
      {(['Terms', 'Privacy'] as const).map((label) => (
        <Action
          key={label}
          label={label}
          onPress={() => router.push(`/legal?document=${label.toLowerCase()}`)}
          style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 4 }}
        >
          <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>{label}</Text>
        </Action>
      ))}
    </View>
  );
}
